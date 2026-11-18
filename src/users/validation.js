const { isStrongPassword } = require('../security/password');

class UserManagementError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (message) => { throw new UserManagementError(400, message); };
function validateProfile(body, create = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('A JSON object is required.');
  if (!create && 'role' in body) throw new UserManagementError(403, 'Existing account roles cannot be changed in this operation.');
  if (create && 'role' in body && !['user', 'admin', 'superadmin'].includes(body.role)) fail('Choose a valid account role.');
  const allowed = ['firstName', 'lastName', 'email', 'empno', ...(create ? ['password', 'confirmPassword', 'role'] : [])];
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Only editable profile fields are accepted.');
  const data = {};
  for (const field of ['firstName', 'lastName']) {
    if (typeof body[field] !== 'string' || !body[field].trim() || [...body[field].trim()].length > 100 || /[\u0000-\u001f\u007f]/u.test(body[field])) fail('Names must contain 1–100 characters without control characters.');
    data[field] = body[field].trim();
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const [local = '', domain = ''] = email.split('@');
  if (!email || email.length > 254 || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || domain.split('.').some((label) => label.length > 63) || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)) fail('Enter a valid email address.');
  data.email = email;
  if ('empno' in body) {
    if (body.empno !== null && (typeof body.empno !== 'string' || !/^[a-zA-Z0-9-]{1,5}$/.test(body.empno))) fail('Employee number must be an existing code of up to five characters, or null.');
    data.empno = body.empno;
  }
  if (create) {
    data.role = body.role ?? 'user';
    if (!isStrongPassword(body.password) || body.password !== body.confirmPassword) fail('Matching passwords need 12 characters, uppercase, lowercase, and a digit; maximum 72 UTF-8 bytes.');
    data.password = body.password;
  }
  return data;
}
function validateId(id) {
  if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) throw new UserManagementError(404, 'Account not found.');
  return id;
}
function validateFilters(query, superadmin) {
  if (Object.keys(query).some((key) => !['search', 'blocked', 'role', 'deleted', 'page'].includes(key))) fail('Unknown list filter.');
  const search = query.search ?? '';
  if (typeof search !== 'string' || search.length > 100 || /[\u0000-\u001f\u007f]/u.test(search)) fail('Search must be at most 100 characters.');
  const blocked = query.blocked ?? 'all', role = query.role ?? 'all', deleted = query.deleted ?? 'all';
  if (!['all', 'true', 'false'].includes(blocked) || !['all', 'user', 'admin', ...(superadmin ? ['superadmin'] : [])].includes(role) || !['all', 'true', 'false'].includes(deleted)) fail('Invalid list filter.');
  if (!superadmin && 'deleted' in query) throw new UserManagementError(403, 'Deleted-account filters are unavailable.');
  const page = query.page ?? '1';
  if (typeof page !== 'string' || !/^[1-9][0-9]{0,5}$/.test(page)) fail('Invalid page number.');
  return { search: search.trim(), blocked, role, deleted, page: Number(page) };
}
module.exports = { UserManagementError, validateProfile, validateId, validateFilters };
