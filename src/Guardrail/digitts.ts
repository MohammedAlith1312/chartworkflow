import { createOutputGuardrail } from "@voltagent/core";

export const digitGuardrail = createOutputGuardrail({
  id: "redact-digits",
  name: "Redact Digit Sequences",

  streamHandler: (args: any) => {
    args.state = args.state ?? {};
    const part = args.part;

    if (part.type !== "text-delta") return part;

    const chunk = ((part as any).delta ?? part.text ?? "") as string;
    if (!chunk) return part;

    const matches = chunk.match(/\d{10,}/g);
    if (matches?.length) {
      args.state.redactionCount =
        (args.state.redactionCount ?? 0) + matches.length;
    }

    const redacted = chunk.replace(/\d{4,}/g, "[digits]");
    return { ...part, text: redacted };
  },

  handler: (args: any) => {
    const count = args.state?.redactionCount ?? 0;
    const finalText = args.result ?? args.output ?? args.text ?? "";

    if (count > 0) {
      return {
        action: "modify",
        pass: true,
        modifiedOutput:
          `${finalText}\n\n` +
          `🔒 **Safety Notice**: ${count} sensitive number sequence(s) were automatically hidden ` +
          `to protect privacy and prevent accidental sharing of personal information.`,
      };
    }

    return { action: "allow", pass: true };
  },
});
