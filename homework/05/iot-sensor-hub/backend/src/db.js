'use strict';

const { Pool } = require('pg');

// Connection settings come from the environment (see docker-compose.yml).
// "db" is the Compose service name, resolved by Docker's embedded DNS.
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.POSTGRES_USER || 'sensor_user',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'sensors',
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// An idle client erroring (e.g. DB restarted) must not crash the process.
pool.on('error', (err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'idle pg client error', err: err.message }));
});

/**
 * Wait until Postgres accepts queries. depends_on/healthcheck already gates
 * startup in Compose, but this keeps the service robust when it is started
 * on its own, or when the DB restarts later.
 */
async function waitForDb(retries = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.warn(
        JSON.stringify({ level: 'warn', msg: 'database not ready', attempt, retries, err: err.message })
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('database did not become ready in time');
}

module.exports = { pool, waitForDb };
