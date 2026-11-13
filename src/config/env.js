const path = require('node:path');
const { loadEnvFile } = require('node:process');

class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function readConfig(env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new ConfigurationError('NODE_ENV must be development, test, or production.');
  }

  function required(name) {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) {
      throw new ConfigurationError(`${name} is required.`);
    }
    return value;
  }

  function port(name, fallback) {
    const value = env[name] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
      throw new ConfigurationError(`${name} must be an integer between 1 and 65535.`);
    }
    return Number(value);
  }

  const sslMode = env.PGSSLMODE ?? 'disable';
  if (!['disable', 'verify-full'].includes(sslMode)) {
    throw new ConfigurationError('PGSSLMODE must be disable or verify-full.');
  }

  // Defaults select the local database; an explicitly blank setting is an error.
  const databaseEnv = {
    ...env,
    PGHOST: env.PGHOST ?? '127.0.0.1',
    PGDATABASE: env.PGDATABASE ?? 'hopedb',
  };
  for (const name of ['PGHOST', 'PGDATABASE']) {
    if (typeof databaseEnv[name] !== 'string' || !databaseEnv[name].trim()) {
      throw new ConfigurationError(`${name} must not be empty.`);
    }
  }

  return {
    nodeEnv,
    port: port('PORT', 3000),
    database: {
      host: databaseEnv.PGHOST.trim(),
      port: port('PGPORT', 5432),
      database: databaseEnv.PGDATABASE.trim(),
      user: required('PGUSER'),
      password: required('PGPASSWORD'),
      ssl: sslMode === 'verify-full' ? { rejectUnauthorized: true } : false,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      query_timeout: 5000,
    },
  };
}

function loadConfig(envFile = path.resolve(__dirname, '../../.env')) {
  try {
    // Existing process variables take precedence over the local file.
    loadEnvFile(envFile);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new ConfigurationError('Unable to read the environment file.');
    }
  }
  return readConfig(process.env);
}

module.exports = { ConfigurationError, readConfig, loadConfig };
