import { createInputGuardrail } from "@voltagent/core";

export const blockWordsGuardrail = createInputGuardrail({
  id: "block-words",
  name: "Restricted Language Filter",

  handler: async ({ inputText }) => {
    const blockedWords = [
      "hack","bad","hate","kill","violence","abuse","harass","attack",
      "threat","hurt","die","death","suicide","self harm",
      "kill yourself","nsfw","nude","sexual","sex","porn","explicit",
      "racist","racism","abusive","offensive","insult","slur",
      "terror","bomb","explode","weapon","gun","shoot","stab",
      "hate speech","bully","bullying","curse","swear","violent",
    ];

    const text = (inputText ?? "").toLowerCase();

    // 🔍 log when guardrail runs
    console.log("[GUARDRAIL:block-words] evaluating input:", text);

    for (const word of blockedWords) {
      const regex = new RegExp(`\\b${word}\\b`, "i");

      if (regex.test(text)) {
        // 🚨 log the exact match
        console.warn(
          "[GUARDRAIL:block-words] BLOCKED",
          { matchedWord: word, input: text }
        );

        return {
          pass: false,
          action: "block",
          error: {
            code: "BLOCKED_WORD",
            message: `Restricted term detected: "${word}"`,
            metadata: {
              guardrailId: "block-words",
              guardrailName: "Restricted Language Filter",
              blockedWord: word,
            },
          },
        };
      }
    }

    // ✅ log successful pass
    console.log("[GUARDRAIL:block-words] passed");

    return { pass: true };
  },
});
