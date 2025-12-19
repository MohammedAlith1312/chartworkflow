import { buildScorer } from "@voltagent/core";

export const mathLiveScorer = buildScorer({
  id: "math-reasoning-100",
  description: "Mathematical reasoning & calculation quality (0–100)",
})
  .score(({ payload }) => {
    if (typeof payload?.output !== "string") {
      return { score: 0, passed: false };
    }

    const text = payload.output.toLowerCase();

    let score = 0;

    // Heuristic signals
    if (/\d/.test(text)) score += 30;              // numbers present
    if (/=|\btherefore\b|\bso\b/.test(text)) score += 20;
    if (/step|calculate|formula|equation/.test(text)) score += 20;
    if (/answer|result|final/.test(text)) score += 10;

    score = Math.min(score, 100);

    return {
      score,
      passed: score >= 60,
      metadata: {
        section: "math",
        hasNumbers: /\d/.test(text),
      },
    };
  })
  .build();
