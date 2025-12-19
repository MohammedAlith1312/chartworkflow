import { createTriggers } from "@voltagent/core";

/**
 * Register Gmail trigger and forward email → workflow
 * Uses runtime narrowing (correct for VoltAgent triggers)
 */
export function registerGmailTrigger(chatWorkflow: {
  run: (input: {
    userId: string;
    conversationId: string;
    text: string;
  }) => Promise<unknown>;
}) {
  createTriggers((on) => {
    on.gmail.newEmail(async (ctx) => {
      // ---- Narrow trigger payload safely ----
      const payload = ctx.payload as {
        message?: {
          id: string;
          threadId?: string;
          snippet?: string;
          payload?: {
            headers?: { name: string; value: string }[];
          };
        };
      };

      if (!payload?.message) return;

      const message = payload.message;
      const headers = message.payload?.headers ?? [];

      const from =
        headers.find((h) => h.name === "From")?.value ?? "unknown";

      const subject =
        headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";

      const snippet = message.snippet ?? "";

      // ✅ Correct execution path
      await chatWorkflow.run({
        userId: "mohammed-alith",
        conversationId:
          message.threadId ?? `gmail_${message.id}`,
        text: `New email received.

From: ${from}
Subject: ${subject}

Content:
${snippet}`,
      });
    });
  });
}
