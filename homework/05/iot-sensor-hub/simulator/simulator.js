'use strict';

/**
 * IoT device simulator - no hardware required.
 *
 * Each virtual device runs its own loop and POSTs a reading to the backend
 * every MIN_INTERVAL_MS..MAX_INTERVAL_MS (default 3-5 s). Values follow a
 * mean-reverting random walk around a per-device profile, plus a slow
 * day/night-style drift, so charts look like real sensor data. Uses only
 * Node's built-in fetch - zero npm dependencies.
 */

const API_URL = (process.env.API_URL || 'http://backend:3000').replace(/\/$/, '');
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS || 3000);
const MAX_INTERVAL_MS = Number(process.env.MAX_INTERVAL_MS || 5000);
const REQUEST_TIMEOUT_MS = 4000;

// Device profiles: baseline values, how strongly the signal wanders, and
// how fast the battery drains (percent per reading, boosted so it is visible in a demo).
const DEVICES = [
  { id: 'sensor-living-room', temp: 22.5, tempSwing: 1.2, hum: 45, humSwing: 5, drain: 0.03, anomalyChance: 0 },
  { id: 'sensor-warehouse',   temp: 15.0, tempSwing: 3.0, hum: 60, humSwing: 8, drain: 0.05, anomalyChance: 0.01 },
  { id: 'sensor-kitchen',     temp: 26.0, tempSwing: 2.5, hum: 55, humSwing: 10, drain: 0.04, anomalyChance: 0.01 },
];

// ----------------------------------------------------------------- helpers

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const round2 = (v) => Math.round(v * 100) / 100;
const rand = (min, max) => min + Math.random() * (max - min);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));

/** Approximate gaussian noise (sum of uniforms) - good enough for simulation. */
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

// ------------------------------------------------------------ device model

function createDevice(profile) {
  const state = {
    temperature: profile.temp + rand(-0.5, 0.5),
    humidity: profile.hum + rand(-2, 2),
    battery: rand(60, 100),
    anomalyTicks: 0,
  };
  const phase = rand(0, Math.PI * 2);
  const startedAt = Date.now();

  return {
    id: profile.id,
    next() {
      // Slow sinusoidal drift (period ~10 min so it is visible in a demo).
      const t = (Date.now() - startedAt) / 1000;
      const drift = Math.sin((t / 600) * Math.PI * 2 + phase);
      const tempTarget = profile.temp + drift * profile.tempSwing;
      const humTarget = profile.hum - drift * profile.humSwing; // humidity moves opposite to temperature

      // Mean reversion toward target + small noise.
      state.temperature += (tempTarget - state.temperature) * 0.15 + gauss() * 0.15;
      state.humidity += (humTarget - state.humidity) * 0.15 + gauss() * 0.4;

      // Occasional short temperature spike for the "anomaly" demo.
      if (state.anomalyTicks === 0 && Math.random() < profile.anomalyChance) {
        state.anomalyTicks = Math.floor(rand(3, 6));
      }
      const spike = state.anomalyTicks > 0 ? rand(4, 8) : 0;
      if (state.anomalyTicks > 0) state.anomalyTicks -= 1;

      // Battery drains slowly; "replace the battery" when nearly empty.
      state.battery -= profile.drain * rand(0.6, 1.4);
      if (state.battery < 5) state.battery = 100;

      return {
        device_id: profile.id,
        temperature: round2(clamp(state.temperature + spike, -50, 150)),
        humidity: round2(clamp(state.humidity, 0, 100)),
        battery: round2(clamp(state.battery, 0, 100)),
      };
    },
  };
}

// ------------------------------------------------------------- networking

async function postReading(reading) {
  const res = await fetch(`${API_URL}/api/sensors/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reading),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

let stopping = false;

async function runDevice(profile) {
  const device = createDevice(profile);
  let failures = 0;

  // Stagger start-up so the three devices do not post in lockstep.
  await sleep(rand(0, 1500));

  while (!stopping) {
    const reading = device.next();
    try {
      await postReading(reading);
      if (failures > 0) log('info', 'backend reachable again', { device: device.id });
      failures = 0;
      log('info', 'reading sent', reading);
    } catch (err) {
      failures += 1;
      log('warn', 'failed to send reading', { device: device.id, failures, err: err.message });
    }

    // Normal cadence 3-5 s; back off (up to 30 s) while the backend is unreachable.
    const base = rand(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
    const backoff = failures > 0 ? Math.min(2 ** failures * 1000, 30_000) : 0;
    await sleep(Math.max(base, backoff));
  }
}

// --------------------------------------------------------------- lifecycle

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log('info', 'shutting down', { signal });
    stopping = true;
    setTimeout(() => process.exit(0), 200).unref();
  });
}

log('info', 'simulator starting', {
  api: API_URL,
  devices: DEVICES.map((d) => d.id),
  intervalMs: [MIN_INTERVAL_MS, MAX_INTERVAL_MS],
});
DEVICES.forEach((profile) => {
  runDevice(profile).catch((err) => {
    log('fatal', 'device loop crashed', { device: profile.id, err: err.message });
    process.exit(1);
  });
});
