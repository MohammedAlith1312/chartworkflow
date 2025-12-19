import type { Context } from "hono";
import type { Memory } from "@voltagent/core";

// Same helper function as above
function extractContentFromMessage(msg: any): string {
  console.log('🔍 Extracting content from:', JSON.stringify(msg, null, 2));
  
  if (typeof msg.content === 'string') return msg.content;
  if (msg.content?.text && typeof msg.content.text === 'string') return msg.content.text;
  
  // VoltAgent stores content in parts JSONB array
  if (msg.parts) {
    try {
      let parts = msg.parts;
      if (typeof parts === 'string') parts = JSON.parse(parts);
      
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part === 'string') return part;
          if (part?.type === 'text' && part.text) return part.text;
          if (part?.text) return part.text;
          if (part?.content) return part.content;
        }
        return JSON.stringify(parts);
      }
      
      if (parts && typeof parts === 'object') {
        if (parts.text) return parts.text;
        if (parts.content) return parts.content;
      }
    } catch (error) {
      console.error('Error parsing parts:', error);
    }
  }
  
  if (typeof msg.text === 'string') return msg.text;
  if (typeof msg.message === 'string') return msg.message;
  if (msg.content?.message) return msg.content.message;
  
  try {
    return JSON.stringify(msg);
  } catch {
    return "[Unable to extract content]";
  }
}

export function historyRoute(deps: {
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
      const messages = await memory.getMessages(
        USER_ID,
        conversationId,
        { limit: 100 }
      );

      // Format messages with proper content extraction
      const formattedMessages = messages.map((msg: any) => {
        const content = extractContentFromMessage(msg);
        
        return {
          id: msg.id || `msg_${Date.now()}_${Math.random().toString(36)}`,
          role: msg.role || (msg.sender || 'user'),
          content: content || "[No content available]",
          timestamp: msg.timestamp || msg.createdAt || msg.created_at || new Date().toISOString(),
          createdAt: msg.createdAt || msg.timestamp || msg.created_at || new Date().toISOString(),
          metadata: msg.metadata || {},
        };
      });

      return c.json({
        userId: USER_ID,
        conversationId,
        messages: formattedMessages,
        count: formattedMessages.length,
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
      return c.json({ 
        userId: USER_ID,
        conversationId,
        messages: [],
        count: 0,
        error: "Failed to fetch conversation history" 
      }, 500);
    }
  };
}