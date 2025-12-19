import type { Context } from "hono";
import { pool } from "../db/live-eval";

export function telemetryGuardrailsRoute() {
  return async (c: Context) => {
    const { rows } = await pool.query(
      `
      SELECT
        conversation_id,
        name AS guardrail,
        status,
        metadata,
        created_at
      FROM telemetry_events
      WHERE event_type = 'GUARDRAIL'
      ORDER BY created_at DESC
      `
    );

    return c.json(rows);
  };
}
