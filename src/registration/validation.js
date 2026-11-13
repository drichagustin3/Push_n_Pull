const fields = ['firstName', 'lastName', 'email', 'password', 'confirmPassword'];

function validateRegistration(body) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { form: 'A JSON object is required.' } };
  }
  if (Object.keys(body).some((key) => !fields.includes(key))) {
    errors.form = 'Only registration fields are accepted.';
  }
  const data = {};
  for (const field of ['firstName', 'lastName']) {
    const value = body[field];
    if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > 100 || /[\u0000-\u001f\u007f]/u.test(value)) {
      errors[field] = 'Enter a name between 1 and 100 characters without control characters.';
    } else data[field] = value.trim();
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const [local, domain = ''] = email.split('@');
  if (!email || email.length > 254 || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || domain.split('.').some((label) => label.length > 63) || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)) {
    errors.email = 'Enter a valid email address of at most 254 characters.';
  } else data.email = email;
  const password = body.password;
  if (typeof password !== 'string' || [...password].length < 12 || Buffer.byteLength(password, 'utf8') > 72 || /\u0000/u.test(password) || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = 'Use at least 12 characters with uppercase, lowercase, and a number; maximum 72 UTF-8 bytes.';
  } else data.password = password;
  if (typeof body.confirmPassword !== 'string' || body.confirmPassword !== password) {
    errors.confirmPassword = 'Passwords must match.';
  }
  return { errors, data };
}

function validateRequest(req, res, next) {
  const result = validateRegistration(req.body);
  if (Object.keys(result.errors).length) {
    return res.status(400).json({ error: 'Please correct the registration fields.', fields: result.errors });
  }
  req.registration = result.data;
  next();
}

module.exports = { validateRegistration, validateRequest };
