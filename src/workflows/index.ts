import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";
import type { Agent, BaseMessage } from "@voltagent/core";

// Helper function to extract text from message content
function extractTextContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(part => part.type === 'text')
      .map(part => part.text || '')
      .join(' ');
  }
  if (content && typeof content === 'object') {
    return content.text || '';
  }
  return String(content || '');
}

// Track conversations and their modes
const conversationModes = new Map<string, {
  mode: 'simple' | 'normal';
  lastActivity: number;
}>();

// Clean up old conversations (1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of conversationModes.entries()) {
    if (now - data.lastActivity > 60 * 60 * 1000) { // 1 hour
      conversationModes.delete(id);
    }
  }
}, 10 * 60 * 1000); // Check every 10 minutes

export function createUnifiedChatWorkflow(agent: Agent) {
  return createWorkflowChain({
    id: "unified-chat-workflow",
    name: "Unified Chat Workflow",

    input: z.object({
      userId: z.string(),
      conversationId: z.string(),
      text: z.string(),
    }),

    result: z.object({
      text: z.string(),
      conversationId: z.string(),
    }),
  })

  /* ---------- STEP 1: VALIDATE AND DETERMINE MODE ---------- */
  .andThen({
    id: "determine-mode",
    execute: async ({ data }) => {
      if (!data.text.trim()) {
        throw new Error("TEXT_REQUIRED");
      }

      const text = data.text.toLowerCase().trim();
      
      // Check if this is a simple greeting
      const isSimpleGreeting = /^(hi|hello|hey|how are you|what's up|good morning|good afternoon|good evening|hi there|hello there)$/i.test(text);
      const isSimpleQuery = text.length < 30 && !text.includes('?');
      
      // Get or create conversation mode
      let conversationMode = conversationModes.get(data.conversationId);
      if (!conversationMode) {
        conversationMode = {
          mode: isSimpleGreeting ? 'simple' : 'normal',
          lastActivity: Date.now()
        };
        conversationModes.set(data.conversationId, conversationMode);
      } else {
        conversationMode.lastActivity = Date.now();
      }

      // Update mode based on current input
      if (isSimpleGreeting) {
        conversationMode.mode = 'simple';
      } else if (!isSimpleGreeting && !isSimpleQuery) {
        conversationMode.mode = 'normal';
      }

      console.log("🎯 Determined mode:", {
        conversationId: data.conversationId,
        mode: conversationMode.mode,
        textPreview: text.substring(0, 50)
      });

      return {
        ...data,
        _mode: conversationMode.mode,
        _isSimpleGreeting: isSimpleGreeting,
      };
    },
  })

  /* ---------- STEP 2: BUILD MESSAGES ---------- */
  .andThen({
    id: "build-messages",
    execute: async ({ data }: { data: any }) => {
      const messages: BaseMessage[] = [];

      // Build system message based on mode
      if (data._mode === 'simple') {
        messages.push({
          role: "system",
          content: `You are responding to a simple greeting.

IMPORTANT RULES:
1. Respond ONLY to this greeting
2. Do NOT mention ANY previous topics (documents, Strapi, etc.)
3. Keep it brief and friendly (1-2 sentences max)
4. Do NOT ask follow-up questions about previous topics

Examples:
- User: "hi" → You: "Hello! 👋"
- User: "how are you" → You: "I'm doing well, thanks! How about you?"
- User: "hey" → You: "Hey there! 😊"`,
        });
      } else {
        // Normal mode
        messages.push({
          role: "system",
          content: `You are a helpful AI assistant. Use your general knowledge to answer.

RULES:
1. Answer the current question only
2. Don't bring up unrelated topics from past conversations
3. If the user asks about something specific, answer concisely
4. Don't volunteer information about previous chats`,
        });
      }

      messages.push({
        role: "user",
        content: data.text,
      });

      console.log("📤 Messages built:", {
        mode: data._mode,
        isSimple: data._mode === 'simple',
        messageCount: messages.length
      });

      return {
        ...data,
        messages,
        meta: {
          userId: data.userId,
          conversationId: data.conversationId,
        },
      };
    },
  })

  /* ---------- STEP 3: RUN AGENT ---------- */
  .andThen({
    id: "run-agent",
    execute: async ({ data }: { data: any }) => {
      const { messages, meta, _mode } = data;

      // Configure memory - NO SEMANTIC MEMORY (RAG)
      // Only use conversation history, no vector search
      const memoryConfig = _mode === 'simple' ? {
        enabled: false, // NO memory for simple greetings
      } : {
        enabled: true,
        semanticLimit: 0, // No semantic search
        semanticThreshold: 1.0, // Effectively disabled
      };

      console.log("🧠 Memory config:", {
        mode: _mode,
        enabled: memoryConfig.enabled,
        noRAG: true
      });

      const result = await agent.generateText(messages, {
        userId: meta.userId,
        conversationId: meta.conversationId,
        semanticMemory: memoryConfig,
      });

      const resultText = extractTextContent(result.text);
      
      console.log("🤖 Agent response:", {
        mode: _mode,
        textLength: resultText.length,
        preview: resultText.substring(0, 100)
      });

      // Update conversation mode if needed
      const currentMode = conversationModes.get(meta.conversationId);
      if (currentMode && _mode === 'simple') {
        // After simple greeting, reset to normal for next message
        setTimeout(() => {
          if (conversationModes.has(meta.conversationId)) {
            conversationModes.set(meta.conversationId, {
              ...currentMode,
              mode: 'normal'
            });
            console.log("🔄 Reset conversation mode to 'normal' after simple greeting");
          }
        }, 1000);
      }

      return {
        answer: resultText,
        conversationId: meta.conversationId,
      };
    },
  })

  /* ---------- STEP 4: FINALIZE ---------- */
  .andThen({
    id: "finalize",
    execute: async ({ data }: { data: any }) => ({
      text: data.answer,
      conversationId: data.conversationId,
    }),
  });
}