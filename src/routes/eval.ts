import type { Context } from "hono";
import { pool } from "../db/live-eval";

export function getLiveEvalsRoute() {
  return async (c: Context) => {
    try {
      const conversationId = c.req.query("conversationId");
      const limit = Number(c.req.query("limit") ?? 50);

      const { rows } = await pool.query(
        `
        SELECT
          id,
          conversation_id,
          scorer_id,
          score,
          passed,
          metadata,
          created_at
        FROM live_eval_results
        WHERE ($1::text IS NULL OR conversation_id = $1)
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [conversationId ?? null, limit]
      );

      // ✅ RETURN ARRAY DIRECTLY
      return c.json(rows);
    } catch (err) {
      console.error("[EVALS] Failed to fetch live evals:", err);
      return c.json([], 500);
    }
  };
}
