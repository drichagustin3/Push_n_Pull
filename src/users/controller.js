const service = require('./service');
const { validateProfile, validateId, validateFilters, UserManagementError } = require('./validation');

function usersController(pool) {
  return {
    async list(req, res) { res.json(await service.listUsers(pool, req.auth.user, validateFilters(req.query, req.user.role === 'superadmin'))); },
    async get(req, res) { res.json({ user: await service.getUser(pool, req.auth.user, validateId(req.params.id)) }); },
    async add(req, res) { res.status(201).json({ user: await service.addUser(pool, req.auth, validateProfile(req.body, true)) }); },
    async edit(req, res) { res.json({ user: await service.editUser(pool, req.auth, validateId(req.params.id), validateProfile(req.body)) }); },
    async block(req, res) {
      if (!req.body || Array.isArray(req.body) || typeof req.body.blocked !== 'boolean' || Object.keys(req.body).some((key) => key !== 'blocked')) throw new UserManagementError(400, 'Provide only a boolean blocked value.');
      res.json({ user: await service.blockUser(pool, req.auth, validateId(req.params.id), req.body.blocked) });
    },
    async toggleBlock(req, res) {
      const body = req.body ?? {};
      if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'isBlocked') || (Object.hasOwn(body, 'isBlocked') && typeof body.isBlocked !== 'boolean')) throw new UserManagementError(400, 'Provide an empty object to toggle, or a boolean isBlocked value.');
      res.json({ user: await service.blockUser(pool, req.auth, validateId(req.params.id), body.isBlocked) });
    },
  };
}
module.exports = { usersController };
