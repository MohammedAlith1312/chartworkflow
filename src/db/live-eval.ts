import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

export async function initLiveEvalTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_eval_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id TEXT,
      scorer_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      passed BOOLEAN NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
