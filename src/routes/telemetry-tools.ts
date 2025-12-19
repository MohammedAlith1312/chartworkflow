import type { Context } from "hono";
import { pool } from "../db/live-eval";

export function telemetryToolsRoute() {
  return async (c: Context) => {
    const { rows } = await pool.query(`
      SELECT
        conversation_id,
        name AS tool,
        metadata,
        created_at
      FROM telemetry_events
      WHERE event_type = 'TOOL'
      ORDER BY created_at DESC
    `);

    return c.json(rows);
  };
}
