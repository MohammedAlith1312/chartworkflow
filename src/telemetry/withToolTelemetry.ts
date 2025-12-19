import type {
  Tool,
  ToolSchema,
  ToolExecuteOptions,
} from "@voltagent/core";
import { pool } from "../db/live-eval";

export function withToolTelemetry<
  TParams extends ToolSchema,
  TMeta extends ToolSchema | undefined = undefined
>(tool: Tool<TParams, TMeta>): Tool<TParams, TMeta> {
  if (!tool.execute) {
    return tool;
  }

  return {
    ...tool,

    execute: async (args, options?: ToolExecuteOptions) => {
      const result = await tool.execute!(args, options);

      const toolName =
        typeof tool.name === "string" && tool.name.trim() !== ""
          ? tool.name
          : "__INVALID_TOOL__";

      await pool.query(
        `
        INSERT INTO telemetry_events
          (conversation_id, event_type, name, status, metadata)
        VALUES ($1, 'TOOL', $2, 'USED', $3)
        `,
        [
          options?.conversationId ?? null,
          toolName,
          { args },
        ]
      );

      return result;
    },
  };
}
