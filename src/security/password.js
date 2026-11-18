function isStrongPassword(password) {
  return typeof password === 'string' && [...password].length >= 12
    && Buffer.byteLength(password, 'utf8') <= 72 && !password.includes('\0')
    && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

module.exports = { isStrongPassword };
