import type {
  InputGuardrail,
  OutputGuardrail,
} from "@voltagent/core";
import { pool } from "../db/live-eval";

/* ======================================================
   INPUT GUARDRAIL (OVERLOAD-SAFE)
   ====================================================== */

export function withInputGuardrailTelemetry(
  guardrail: InputGuardrail,
  name?: string
): InputGuardrail;

export function withInputGuardrailTelemetry(
  guardrail: any,
  name = "input-guardrail"
): InputGuardrail {
  if (typeof guardrail === "function") {
    return async (args: any) => {
      const result = await guardrail(args);
      await logGuardrail(name, result);
      return result;
    };
  }

  return {
    ...guardrail,
    handler: async (args: any) => {
      const result = await guardrail.handler(args);
      await logGuardrail(name, result);
      return result;
    },
  };
}

/* ======================================================
   OUTPUT GUARDRAIL (GENERIC-PRESERVING OVERLOAD)
   ====================================================== */

export function withOutputGuardrailTelemetry<T>(
  guardrail: OutputGuardrail<T>,
  name?: string
): OutputGuardrail<T>;

export function withOutputGuardrailTelemetry(
  guardrail: any,
  name = "output-guardrail"
): any {
  if (typeof guardrail === "function") {
    return async (args: any) => {
      const result = await guardrail(args);
      await logGuardrail(name, result);
      return result;
    };
  }

  return {
    ...guardrail,
    handler: async (args: any) => {
      const result = await guardrail.handler(args);
      await logGuardrail(name, result);
      return result;
    },
  };
}

/* ======================================================
   LOGGER
   ====================================================== */

async function logGuardrail(
  name: string,
  result: unknown
) {
  const passed =
    typeof result === "object" &&
    result !== null &&
    "passed" in result &&
    typeof (result as any).passed === "boolean"
      ? (result as any).passed
      : undefined;

  await pool.query(
    `
    INSERT INTO telemetry_events
      (conversation_id, event_type, name, status, metadata)
    VALUES ($1, 'GUARDRAIL', $2, $3, $4)
    `,
    [
      null,
      name,
      passed === undefined
        ? "UNKNOWN"
        : passed
        ? "PASSED"
        : "BLOCKED",
      result,
    ]
  );
}
