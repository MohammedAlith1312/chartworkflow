import type { Context } from "hono";

export function documentsRoute(deps: {
  ingestDocumentText: (text: string) => Promise<void>;
  memory: any;
  USER_ID: string;
}) {
  const { ingestDocumentText, memory, USER_ID } = deps;

  return async (c: Context) => {
    const body = await c.req.json();
    const text = String(body.text ?? "");
    const conversationId = body.conversationId ?? null;

    if (!text.trim()) {
      return c.json({ error: "text is required" }, 400);
    }

    await ingestDocumentText(text);

    if (conversationId) {
      await memory.addMessage(
        {
          role: "system",
          content:
            "[Document ingested into knowledge base as chunks]\n" +
            text.slice(0, 300),
        } as any,
        USER_ID,
        conversationId
      );
    }

    return c.json({ success: true });
  };
}
