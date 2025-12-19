import type { Context } from "hono";
import type { Agent, BaseMessage, Memory } from "@voltagent/core";

/* ======================================================
   Helper: generate human-readable title
   ====================================================== */
function generateConversationTitle(text: string): string {
  return text
    .replace(/[^\w\s?]/g, "")   // remove symbols
    .replace(/\s+/g, " ")       // normalize spaces
    .trim()
    .slice(0, 60);              // max length
}

export function chatRoute(deps: {
  agent: Agent;
  memory: Memory;
  USER_ID: string;
}) {
  const { agent, memory, USER_ID } = deps;

  return async (c: Context) => {
    try {
      const body = await c.req.json();
      const text = String(body.text ?? "").trim();

      if (!text) {
        return c.json(
          {
            ok: false,
            error: "VALIDATION_ERROR",
            message: "Message text is required.",
          },
          400
        );
      }

      const conversationId =
        body.conversationId ??
        `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const messages: BaseMessage[] = [
        { role: "user", content: text },
      ];

      /* ======================================================
         1️⃣ Generate assistant response (UNCHANGED behavior)
         ====================================================== */
      const result = await agent.generateText(messages, {
        userId: USER_ID,
        conversationId,
      });

      /* ======================================================
         2️⃣ SAFE title update (CORE FIX)
         ====================================================== */
      const conversation = await memory.getConversation(conversationId);

      // Update title ONLY if it's default / missing
      if (
        conversation &&
        (!conversation.title ||
          conversation.title.startsWith("New Chat"))
      ) {
        await memory.updateConversation(conversationId, {
          title: generateConversationTitle(text),
        });
      }

      return c.json({
        ok: true,
        text: result.text,
        conversationId,
      });
    } catch (err: any) {
      console.error("[/api/chat] unexpected error:", err);

      return c.json(
        {
          ok: false,
          error: "INTERNAL_ERROR",
          message: "Something went wrong while processing your request.",
        },
        500
      );
    }
  };
}
