import type { Context } from "hono";
import type { Memory } from "@voltagent/core";

/* ======================================================
   Helpers
   ====================================================== */

// Extract readable text from VoltAgent message structure
function extractContentFromMessage(msg: any): string {
  if (typeof msg.content === "string") return msg.content;

  if (msg.content?.text && typeof msg.content.text === "string") {
    return msg.content.text;
  }

  if (msg.parts) {
    try {
      const parts =
        typeof msg.parts === "string"
          ? JSON.parse(msg.parts)
          : msg.parts;

      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part === "string") return part;
          if (part?.type === "text" && part.text) return part.text;
          if (part?.text) return part.text;
        }
      }
    } catch {
      /* ignore parsing errors */
    }
  }

  if (typeof msg.text === "string") return msg.text;
  if (typeof msg.message === "string") return msg.message;

  return "[No content available]";
}

// Generate a clean, deterministic conversation title
function generateConversationTitle(text: string): string {
  return text
    .replace(/[^\w\s?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/* ======================================================
   Route
   ====================================================== */

export function conversationsRoute(deps: {
  memory: Memory;
  USER_ID: string;
}) {
  const { memory, USER_ID } = deps;

  return async (c: Context) => {
    try {
      /* 1️⃣ Fetch conversations for user */
      const conversations = await memory.getConversationsByUserId(
        USER_ID,
        {
          limit: 50,
          orderBy: "created_at",
          orderDirection: "DESC",
        }
      );

      /* 2️⃣ Attach messages and ensure titles */
      const conversationsWithMessages = await Promise.all(
        conversations.map(async (conv: any) => {
          const messages = await memory.getMessages(
            USER_ID,
            conv.id,
            { limit: 100 }
          );

          const formattedMessages = messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: extractContentFromMessage(msg),
            timestamp:
              msg.createdAt ||
              msg.created_at ||
              msg.timestamp ||
              new Date().toISOString(),
            metadata: msg.metadata || {},
          }));

          /* ======================================================
             TITLE LOGIC (FIXED & TYPE-SAFE)
             ====================================================== */

          let title: string | undefined = conv.title;

          // Set title ONCE from first user message
          if (!title) {
            const firstUserMessage = formattedMessages.find(
              m => m.role === "user" && m.content
            );

            if (firstUserMessage) {
              title = generateConversationTitle(firstUserMessage.content);

              // ✅ Correct Memory API usage (2 args only)
              await memory.updateConversation(conv.id, {
                title,
              });
            }
          }

          const preview =
            formattedMessages.find(m => m.content)?.content?.slice(0, 100) ||
            "Start a conversation...";

          return {
            id: conv.id,
            title: title || "Conversation",
            preview,
            messages: formattedMessages,
            messageCount: formattedMessages.length,
            createdAt:
              conv.createdAt ||
              conv.created_at ||
              new Date().toISOString(),
            lastMessageAt:
              formattedMessages.at(-1)?.timestamp ||
              conv.createdAt ||
              conv.created_at ||
              new Date().toISOString(),
            userId: USER_ID,
            metadata: conv.metadata || {},
          };
        })
      );

      /* 3️⃣ Response */
      return c.json({
        conversations: conversationsWithMessages,
        total: conversationsWithMessages.length,
        active: conversationsWithMessages.filter(
          c => c.messageCount > 0
        ).length,
      });
    } catch (error) {
      console.error("❌ Error fetching conversations:", error);

      return c.json(
        {
          conversations: [],
          total: 0,
          active: 0,
          error: "Failed to fetch conversations",
        },
        500
      );
    }
  };
}
