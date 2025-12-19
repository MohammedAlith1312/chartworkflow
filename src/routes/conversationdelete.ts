import type { Context } from "hono";
import type { Memory } from "@voltagent/core";

export function deleteConversationRoute(deps: {
  memory: Memory;
  USER_ID: string;
}) {
  const { memory, USER_ID } = deps;

  return async (c: Context) => {
    const conversationId = c.req.param("conversationId");

    if (!conversationId) {
      return c.json({ error: "conversationId is required" }, 400);
    }

    try {
      // Note: deleteConversation only takes conversationId as parameter
      // If you need user-specific deletion, you might need to handle it differently
      await memory.deleteConversation(conversationId);
      
      return c.json({ 
        success: true,
        message: "Conversation deleted successfully",
        conversationId 
      });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      return c.json({ 
        success: false,
        error: "Failed to delete conversation",
        conversationId 
      }, 500);
    }
  };
}