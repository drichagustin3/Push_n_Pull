const { Router } = require('express');
const { AuthError } = require('../auth/service');
const { createAuthorization } = require('../rbac/middleware');
const { moduleCode, adminRoles, rights, listJobs, readJob, writeJob } = require('./service');

const path = '/api/hr/jobs';
const detail = path + '/:jobCode';
const invalid = (message) => new AuthError(400, 'validation_error', message);
const hasControls = (value) => /[\u0000-\u001f\u007f]/.test(value);

function filter(query) {
  if (Object.keys(query).some((key) => !['search', 'status'].includes(key))) {
    throw invalid('Only search and status query parameters are supported.');
  }
  const { search = '', status = 'active' } = query;
  if (typeof search !== 'string' || search.length > 100 || hasControls(search)) {
    throw invalid('Search must be text of at most 100 characters without control characters.');
  }
  if (typeof status !== 'string' || !['active', 'inactive', 'all'].includes(status.toLowerCase())) {
    throw invalid('Status must be Active, Inactive, or All.');
  }
  return { search: search.trim(), status: status.toLowerCase() };
}

function field(value, label, limit, trim = true) {
  if (typeof value !== 'string' || !value.trim() || hasControls(value)) {
    throw invalid(label + ' is required and must be text without control characters.');
  }
  const result = trim ? value.trim() : value;
  if ([...result].length > limit) throw invalid(label + ' must be at most ' + limit + ' characters.');
  return result;
}

function jobsRouter(pool, config, sessions) {
  const router = Router();
  const access = createAuthorization(pool, config);
  const view = access.requireModuleAccess(moduleCode);
  router.use(path, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }, sessions);
  router.get(path, view, async (req, res) => res.json(await listJobs(pool, req.access, filter(req.query))));
  router.get(detail, view, async (req, res) => res.json(await readJob(pool, req.access,
    field(req.params.jobCode, 'Job code', 4, false))));

  for (const [method, route, operation] of [
    ['post', path, 'create'], ['put', detail, 'edit'], ['delete', detail, 'delete'],
    ['post', detail + '/restore', 'restore'],
  ]) {
    const authorize = operation === 'restore' ? access.requireRole(...adminRoles) : access.requireRight(rights[operation]);
    router[method](route, authorize, async (req, res) => {
      if (req.get('origin') !== config.origin) throw new AuthError(403, 'invalid_origin', 'Request origin is not allowed.');
      if (config.secure && !req.secure) throw new AuthError(400, 'https_required', 'A secure HTTPS connection is required.');
      const creating = operation === 'create';
      const editing = operation === 'edit';
      if ((creating || editing) && !req.is('application/json')) {
        throw new AuthError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
      }
      const allowed = creating ? ['jobCode', 'jobDesc'] : editing ? ['jobDesc'] : [];
      if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).some((key) => !allowed.includes(key)))) {
        throw invalid('Provide only supported Job fields.');
      }
      const code = field(creating ? req.body?.jobCode : req.params.jobCode, 'Job code', 4, creating);
      if (creating && (code === '.' || code === '..')) throw invalid('Choose a different Job code.');
      const description = creating || editing ? field(req.body?.jobDesc, 'Job description', 20) : undefined;
      res.status(creating ? 201 : 200).json(await writeJob(pool, req.auth, operation, code, description));
    });
  }

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.code, message: error.message });
    if (error instanceof URIError) return res.status(400).json({ error: 'validation_error', message: 'Invalid Job code.' });
    res.status(503).json({ error: 'jobs_unavailable', message: 'Jobs are temporarily unavailable.' });
  });
  return router;
}

module.exports = { jobsRouter };
