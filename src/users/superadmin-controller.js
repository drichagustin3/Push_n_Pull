const { validateId, UserManagementError } = require('./validation');
const { reviewPending, changeRole, removeUser } = require('./superadmin-service');

function objectBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) throw new UserManagementError(400, 'Only the operation fields are accepted.');
}
function superadminController(pool) {
  return {
    async approve(req, res) { objectBody(req.body ?? {}, []); res.json({ user: await reviewPending(pool, req.auth, validateId(req.params.id), true) }); },
    async reject(req, res) { objectBody(req.body ?? {}, []); res.json({ user: await reviewPending(pool, req.auth, validateId(req.params.id), false) }); },
    async role(req, res) { objectBody(req.body, ['role']); res.json({ user: await changeRole(pool, req.auth, validateId(req.params.id), req.body.role) }); },
    async remove(req, res) { objectBody(req.body ?? {}, []); res.json({ user: await removeUser(pool, req.auth, validateId(req.params.id)) }); },
  };
}
module.exports = { superadminController };
