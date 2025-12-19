import { createInputGuardrail } from "@voltagent/core";

/**
 * Utility to safely escape regex special characters
 */
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const blockWordsGuardrail = createInputGuardrail({
  id: "block-words",
  name: "Restricted Language Filter",

  handler: async ({ inputText }) => {
    const blockedWords = [
      "hack",
      "bad",
      "hate",
      "kill",
      "violence",
      "abuse",
      "harass",
      "attack",
      "threat",
      "hurt",
      "die",
      "death",
      "suicide",
      "self harm",
      "kill yourself",
      "nsfw",
      "nude",
      "sexual",
      "sex",
      "porn",
      "explicit",
      "racist",
      "racism",
      "abusive",
      "offensive",
      "insult",
      "slur",
      "terror",
      "bomb",
      "explode",
      "weapon",
      "gun",
      "shoot",
      "stab",
      "hate speech",
      "bully",
      "bullying",
      "curse",
      "swear",
      "violent",
    ];

    const text = (inputText ?? "").toLowerCase();

    // 🔍 Log guardrail execution
    console.log("[GUARDRAIL:block-words] evaluating input:", text);

    for (const word of blockedWords) {
      const escaped = escapeRegex(word);

      /**
       * Word-boundary for single words
       * Flexible spacing for multi-word phrases
       */
      const pattern = word.includes(" ")
        ? `\\b${escaped.replace(/\s+/g, "\\s+")}\\b`
        : `\\b${escaped}\\b`;

      const regex = new RegExp(pattern, "i");

      if (regex.test(text)) {
        // 🚨 Internal log (do NOT expose to client)
        console.warn("[GUARDRAIL:block-words] BLOCKED", {
          matchedWord: word,
          input: text,
        });

        return {
          pass: false,
          action: "block",
          error: {
            code: "BLOCKED_WORD",
            message: "Restricted language detected",
            metadata: {
              guardrailId: "block-words",
              guardrailName: "Restricted Language Filter",

              // 🔐 Internal/debug-only
              blockedWord: word,

              // ✅ SAFE for UI / API response
              userMessage:
                "Your message contains restricted language. Please rephrase and try again.",
            },
          },
        };
      }
    }

    // ✅ Passed
    console.log("[GUARDRAIL:block-words] passed");
    return { pass: true };
  },
});
