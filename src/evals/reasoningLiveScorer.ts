import { buildScorer } from "@voltagent/core";

export const logicalReasoningLiveScorer = buildScorer({
  id: "logical-reasoning-100",
  description: "Tests logical reasoning and problem-solving capability (0–100)",
})
  .score(({ payload }) => {
    if (typeof payload?.output !== "string") {
      return {
        score: 0,
        passed: false,
        metadata: { skipped: true },
      };
    }

    const text = payload.output.toLowerCase();
    let score = 0;

    // 1) Problem decomposition / structure
    if (/step|first|second|finally|approach|plan/.test(text)) score += 20;

    // 2) Causal / logical connectors
    if (/because|therefore|thus|hence|so that|as a result/.test(text)) score += 20;

    // 3) Analysis language
    if (/analyze|analysis|assume|consider|trade-?off|constraint/.test(text)) score += 20;

    // 4) Solution clarity
    if (/solution|answer|result|conclusion|final/.test(text)) score += 15;

    // 5) Evidence of reasoning depth
    if (text.length >= 30) score += 15;

    // 6) Examples or validation
    if (/example|for instance|verify|check|edge case/.test(text)) score += 10;

    score = Math.min(score, 100);

    return {
      score,
      passed: score >= 60,
      metadata: {
        section: "logical-reasoning",
        length: text.length,
      },
    };
  })
  .build();
