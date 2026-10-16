-- IoT Sensor Monitoring Hub - database initialisation
-- Executed automatically by the official postgres image on FIRST start only
-- (when the data directory is empty). To re-run it, remove the volume:
--   docker compose down -v

CREATE TABLE IF NOT EXISTS sensor_readings (
    id          BIGSERIAL        PRIMARY KEY,
    device_id   VARCHAR(64)      NOT NULL,
    temperature REAL             NOT NULL CHECK (temperature BETWEEN -50 AND 150),
    humidity    REAL             NOT NULL CHECK (humidity    BETWEEN 0 AND 100),
    battery     REAL             NOT NULL CHECK (battery     BETWEEN 0 AND 100),
    recorded_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Serves both "latest per device" and "history for one device" queries.
CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time
    ON sensor_readings (device_id, recorded_at DESC);

-- Serves the retention job (DELETE ... WHERE recorded_at < ...).
CREATE INDEX IF NOT EXISTS idx_sensor_readings_time
    ON sensor_readings (recorded_at);
