const { ConfigurationError } = require('../config/env');

function readResetConfig(env, nodeEnv, authConfig) {
  const appUrl = env.APP_URL || (nodeEnv === 'development' ? authConfig.origin : '');
  if (appUrl !== authConfig.origin) {
    throw new ConfigurationError('APP_URL must match the exact APP_ORIGIN.');
  }
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER || undefined;
  const pass = env.SMTP_PASS || undefined;
  if (Boolean(user) !== Boolean(pass) || (!host && (user || pass))) {
    throw new ConfigurationError('SMTP_USER and SMTP_PASS must be supplied together with SMTP_HOST.');
  }
  const from = env.MAIL_FROM || (nodeEnv === 'development' ? 'noreply@example.test' : '');
  if (from.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) {
    throw new ConfigurationError('MAIL_FROM must be a valid sender email address.');
  }
  if (!host) {
    if (nodeEnv !== 'development') throw new ConfigurationError('SMTP_HOST is required outside development.');
    return { appUrl, from, mode: 'console' };
  }
  if (/[\s/]/.test(host)) throw new ConfigurationError('SMTP_HOST must be a hostname or IP address.');
  const port = env.SMTP_PORT || '587';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new ConfigurationError('SMTP_PORT must be an integer between 1 and 65535.');
  }
  return { appUrl, from, mode: 'smtp', smtp: {
    host, port: Number(port), secure: Number(port) === 465,
    requireTLS: nodeEnv === 'production' && Number(port) !== 465,
    ...(user ? { auth: { user, pass } } : {}),
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    logger: false, debug: false,
  } };
}

module.exports = { readResetConfig };
