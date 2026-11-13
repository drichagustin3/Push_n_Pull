const { ConfigurationError } = require('../config/env');

function readAuthConfig(env, nodeEnv) {
  const secret = env.SESSION_SECRET;
  if (typeof secret !== 'string' || !secret.trim() || Buffer.byteLength(secret) < 32 || secret.startsWith('replace_')) {
    throw new ConfigurationError('SESSION_SECRET must be a private random secret of at least 32 bytes.');
  }
  let origin;
  try {
    const url = new URL(env.APP_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== env.APP_ORIGIN) throw new Error();
    if (nodeEnv === 'production' && url.protocol !== 'https:') throw new Error();
    origin = url.origin;
  } catch {
    throw new ConfigurationError('APP_ORIGIN must be an exact HTTP(S) origin; production requires HTTPS.');
  }
  const proxy = env.TRUST_PROXY ?? 'none';
  if (!['none', 'loopback'].includes(proxy)) throw new ConfigurationError('TRUST_PROXY must be none or loopback.');
  return { secret, origin, secure: origin.startsWith('https:'), trustProxy: proxy === 'loopback' ? 'loopback' : false };
}

module.exports = { readAuthConfig };
