import type { Context } from "hono";
import type { Memory } from "@voltagent/core";

export function deleteHistoryRoute(deps: {
  memory: Memory;
  USER_ID: string;
}) {
  const { memory, USER_ID } = deps;

  return async (c: Context) => {
    const id = c.req.param("id");

    if (!id) {
      return c.json({ error: "conversationId is required" }, 400);
    }

    await memory.deleteConversation(USER_ID);

    return c.json({ success: true });
  };
}
