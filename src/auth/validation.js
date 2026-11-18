const { isStrongPassword } = require('../security/password');

function loginInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['email', 'password', 'setup_token'].includes(key))) return null;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !email.includes('@')) return null;
  const hasPassword = typeof body.password === 'string';
  const hasToken = typeof body.setup_token === 'string';
  if (hasPassword === hasToken) return null;
  if (hasPassword && (!body.password || Buffer.byteLength(body.password) > 72 || body.password.includes('\0'))) return null;
  if (hasToken && !/^[a-f0-9]{64}$/.test(body.setup_token)) return null;
  return { email, ...(hasPassword ? { password: body.password } : { setup_token: body.setup_token }) };
}

function passwordInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['new_password', 'confirm_password'].includes(key))) return null;
  return isStrongPassword(body.new_password) && body.confirm_password === body.new_password ? body.new_password : null;
}

module.exports = { loginInput, passwordInput };
