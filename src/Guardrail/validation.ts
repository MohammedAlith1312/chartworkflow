import { createInputGuardrail } from "@voltagent/core";

export const validationGuardrail = createInputGuardrail({
  id: "input-validation",
  name: "Input Validation",
  description: "Validates input length and format requirements.",
  severity: "critical",

  handler: async ({ inputText }) => {
    const text = String(inputText ?? "");
      console.log("[GUARDRAIL:validation] input =", inputText);

    if (!text.trim()) {
      return {
        pass: false,
        action: "block",
        message:
          "Your message is empty. Please enter a question or statement so I can assist you.",
      };
    }

    if (text.length > 10_000) {
      return {
        pass: false,
        action: "block",
        message:
          "Your message is too long. Please shorten it to under 10,000 characters and try again.",
        metadata: {
          inputLength: text.length,
          maxLength: 10_000,
        },
      };
    }

    const wordCount = text
      .split(/\s+/)
      .filter(Boolean).length;

    if (wordCount < 1) {
      return {
        pass: false,
        action: "block",
        message:
          "Your message does not contain enough meaningful content. Please add more details and try again.",
        metadata: { wordCount },
      };
    }

    return { pass: true };
  },
});
