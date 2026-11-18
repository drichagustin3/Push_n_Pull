const { validateId } = require('./validation');
const { getRights, putRights, validateRights } = require('./rights-service');

function rightsController(pool) {
  return {
    async get(req, res) { res.json(await getRights(pool, req.auth, validateId(req.params.id))); },
    async put(req, res) { res.json(await putRights(pool, req.auth, validateId(req.params.id), validateRights(req.body))); },
  };
}
module.exports = { rightsController };
