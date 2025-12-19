import { buildScorer } from "@voltagent/core";

type ToolPayload = {
  name?: string;
  error?: unknown;
};

export const toolUsageLiveScorer = buildScorer({
  id: "tool-usage-100",
  description: "Tool selection & usage correctness (0–100)",
})
  .score(({ payload }) => {
    const tool = payload?.tool as ToolPayload | undefined;

    // No tool used
    if (!tool) {
      return {
        score: 40,
        passed: false,
        metadata: { reason: "No tool used" },
      };
    }

    // Tool failed
    if ("error" in tool && tool.error) {
      return {
        score: 20,
        passed: false,
        metadata: { error: String(tool.error) },
      };
    }

    // Tool used successfully
    return {
      score: 90,
      passed: true,
      metadata: {
        toolName: tool.name ?? "unknown",
        success: true,
      },
    };
  })
  .build();
