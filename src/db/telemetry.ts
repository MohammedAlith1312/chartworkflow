import { pool } from "./live-eval";

export async function initTelemetryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id TEXT,
      event_type TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_events_type_time
    ON telemetry_events (event_type, created_at DESC);
  `);

  console.log("✅ telemetry_events table ready");
}
