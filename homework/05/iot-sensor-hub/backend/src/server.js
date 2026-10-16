'use strict';

const express = require('express');
const { pool, waitForDb } = require('./db');

const PORT = Number(process.env.PORT || 3000);
const RETENTION_HOURS = Number(process.env.RETENTION_HOURS || 24);
const RETENTION_INTERVAL_MS = 10 * 60 * 1000;

const DEVICE_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));

// ---------------------------------------------------------------- helpers

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));

const isNumberInRange = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Validate a POST body. Returns { value } on success or { errors } on failure. */
function validateReading(body) {
  const errors = [];
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['body must be a JSON object'] };
  }

  const { device_id: deviceId, temperature, humidity, battery, recorded_at: recordedAt } = body;

  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    errors.push('device_id must be 1-64 characters of [A-Za-z0-9._-]');
  }
  if (!isNumberInRange(temperature, -50, 150)) errors.push('temperature must be a number between -50 and 150');
  if (!isNumberInRange(humidity, 0, 100)) errors.push('humidity must be a number between 0 and 100');
  if (!isNumberInRange(battery, 0, 100)) errors.push('battery must be a number between 0 and 100');

  let recordedAtDate = null;
  if (recordedAt !== undefined && recordedAt !== null) {
    recordedAtDate = new Date(recordedAt);
    if (typeof recordedAt !== 'string' || Number.isNaN(recordedAtDate.getTime())) {
      errors.push('recorded_at must be an ISO 8601 timestamp string');
    }
  }

  if (errors.length > 0) return { errors };
  return {
    value: {
      deviceId,
      temperature,
      humidity,
      battery,
      recordedAt: recordedAtDate ? recordedAtDate.toISOString() : null,
    },
  };
}

/** Wrap async route handlers so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ----------------------------------------------------------------- routes

// Liveness + DB connectivity. Used by the Docker healthcheck.
app.get('/api/health', asyncHandler(async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
  } catch (err) {
    log('error', 'health check failed', { err: err.message });
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
}));

// Ingest one reading.
app.post('/api/sensors/data', asyncHandler(async (req, res) => {
  const { value, errors } = validateReading(req.body);
  if (errors) return res.status(400).json({ error: 'validation_failed', details: errors });

  const { rows } = await pool.query(
    `INSERT INTO sensor_readings (device_id, temperature, humidity, battery, recorded_at)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
     RETURNING id, device_id, temperature, humidity, battery, recorded_at`,
    [value.deviceId, value.temperature, value.humidity, value.battery, value.recordedAt]
  );
  return res.status(201).json(rows[0]);
}));

// Most recent reading for every device.
app.get('/api/sensors/latest', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (device_id)
            id, device_id, temperature, humidity, battery, recorded_at
       FROM sensor_readings
      ORDER BY device_id, recorded_at DESC`
  );
  // server_time lets clients compute reading age without trusting their own clock.
  res.json({ server_time: new Date().toISOString(), count: rows.length, readings: rows });
}));

// Time series for one device (oldest -> newest, ready for charting).
// Query params: limit (1-1000, default 100), minutes (1-1440, optional window).
app.get('/api/sensors/history/:deviceId', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  if (!DEVICE_ID_RE.test(deviceId)) {
    return res.status(400).json({ error: 'validation_failed', details: ['invalid deviceId'] });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
  const minutesRaw = parseInt(req.query.minutes, 10);
  const minutes = Number.isFinite(minutesRaw) ? Math.min(Math.max(minutesRaw, 1), 1440) : null;

  const { rows } = await pool.query(
    `SELECT id, device_id, temperature, humidity, battery, recorded_at
       FROM (
              SELECT id, device_id, temperature, humidity, battery, recorded_at
                FROM sensor_readings
               WHERE device_id = $1
                 AND ($3::int IS NULL OR recorded_at >= now() - make_interval(mins => $3::int))
               ORDER BY recorded_at DESC
               LIMIT $2
            ) AS recent
      ORDER BY recorded_at ASC`,
    [deviceId, limit, minutes]
  );
  res.json({ device_id: deviceId, count: rows.length, readings: rows });
}));

// 404 for anything else under /api
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// Malformed JSON and unexpected errors.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  log('error', 'unhandled error', { err: err.message });
  return res.status(500).json({ error: 'internal_error' });
});

// ---------------------------------------------------------------- lifecycle

async function pruneOldReadings() {
  try {
    const result = await pool.query(
      `DELETE FROM sensor_readings WHERE recorded_at < now() - make_interval(hours => $1::int)`,
      [RETENTION_HOURS]
    );
    if (result.rowCount > 0) log('info', 'retention cleanup', { deleted: result.rowCount });
  } catch (err) {
    log('warn', 'retention cleanup failed', { err: err.message });
  }
}

async function main() {
  await waitForDb();
  log('info', 'database connection established');

  const server = app.listen(PORT, '0.0.0.0', () => log('info', 'backend listening', { port: PORT }));
  const retentionTimer = setInterval(pruneOldReadings, RETENTION_INTERVAL_MS);
  retentionTimer.unref();

  // Graceful shutdown: stop accepting connections, drain the pool, then exit.
  const shutdown = (signal) => {
    log('info', 'shutting down', { signal });
    clearInterval(retentionTimer);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log('fatal', 'startup failed', { err: err.message });
  process.exit(1);
});
