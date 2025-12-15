// backend/agent.ts
import "dotenv/config";
import {
  VoltAgent,
  Agent,
  Memory,
  AiSdkEmbeddingAdapter,
  type BaseMessage,
} from "@voltagent/core";
import {
  PostgreSQLMemoryAdapter,
  PostgreSQLVectorAdapter,
} from "@voltagent/postgres";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { honoServer } from "@voltagent/server-hono";

import { weatherTool, calculatorTool, getLocationTool } from "./tools";
import { ingestDocumentText, searchDocumentsByQuery } from "./vector-store";
import { initDocumentVectorTable } from "./db-init";
import { createUnifiedChatWorkflow } from "./workflows";
import { blockWordsGuardrail } from './Guardrail/words';
import { digitGuardrail } from './Guardrail/digitts';
import { sanitizeGuardrail } from './Guardrail/sanitize';
import { validationGuardrail } from './Guardrail/validation';

// ---------- OpenRouter for CHAT ----------
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  headers: {
    "HTTP-Referer": "https://voltagent-chatbotbackend.onrender.com",
    "X-Title": "voltagent-app",
  },
});

// ---------- OpenRouter for EMBEDDINGS (memory) ----------
const openrouterForEmbeddings = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
  name: "openrouter",
  headers: {
    "HTTP-Referer":
      "https://voltagent-chatbotbackend.onrender.com/agents/sample-app/chat",
    "X-Title": "voltagent-app",
  },
});

const embeddingModel =
  openrouterForEmbeddings.embedding("text-embedding-3-small");

// ---------- MEMORY (conversation history + semantic recall) ----------
export const memory = new Memory({
  storage: new PostgreSQLMemoryAdapter({
    connection: process.env.DATABASE_URL!,
  }),
  embedding: new AiSdkEmbeddingAdapter(embeddingModel),
  vector: new PostgreSQLVectorAdapter({
    connection: process.env.DATABASE_URL!,
  }),
});


// ---------- AGENT ----------
export const agent = new Agent({
  name: "sample-app",
  model: openrouter.chat("amazon/nova-2-lite-v1:free"),
  inputGuardrails: [blockWordsGuardrail, sanitizeGuardrail, validationGuardrail],
  outputGuardrails: [digitGuardrail],
  tools: [weatherTool, calculatorTool, getLocationTool],
  memory,
  instructions: `
You are a helpful and precise AI assistant.

# MEMORY
- You have access to past conversations via semantic memory.
- Relevant past messages may be injected into the context.
- Use them naturally when answering.
- Never state that you do not have access to previous chats.

# DOCUMENTS (RAG)
- You may receive snippets from uploaded documents (PDFs, files, images).
- When document snippets are provided and relevant, treat them as the primary source of truth.
- If you answer based on documents, explicitly say:
  "According to the uploaded document, ..."

# VALIDATION MODE
- When the user asks for validation (e.g., code, SQL, logic, configuration):
  - Do NOT explain unless explicitly asked.
  - Respond only with VALID or INVALID.
  - If INVALID, provide only the corrected final answer (e.g., corrected code or query).
  - Do not include reasoning, steps, or summaries.

# CODING MODE
- When the user asks for code (e.g., “give example”, “write code”, “create a button in HTML”):
  - Respond primarily with code blocks.
  - Keep explanations minimal (one short line if needed), or omit them unless explicitly requested.
  - For simple tasks (e.g., “create an HTML button”), return just the code needed to solve the task.
- When the user asks to fix or improve code:
  - Return the corrected code in a single code block.
  - Do not include long explanations unless explicitly requested.

# TOOLS
- Weather tool → weather-related questions only.
- Calculator tool → mathematical calculations only.
- Location tool → user location-related questions only.
- Use tools only when clearly necessary.

# GENERAL BEHAVIOR
- Be concise, accurate, and direct.
- Do not add unnecessary explanations.
- Avoid assumptions when information is insufficient.
- If asked about past chats, summarize using injected context only.


`,
});

const chatWorkflow = createUnifiedChatWorkflow(agent);

// ---------- SERVER ----------
const USER_ID = "mohammed-alith" as const;



// Match the frontend type shape
interface UIMessage {
  role: "user" | "assistant" | "system" | "function" | "tool";
  content: string;
}

  // Ensure pgvector + documents table exist
  await initDocumentVectorTable();


 const PORT = Number(process.env.PORT) || 5000;


  new VoltAgent({
    agents: {
      "sample-app": agent,
    },
    workflows:{
      "chat-workflow": chatWorkflow,
    },
    server: honoServer({
      port:PORT,
      
     
      configureApp: (app) => {
        // 1) List conversations (history UI)
        app.get("/api/conversations", async (c) => {
          const conversations = await memory.getConversationsByUserId(
            USER_ID,
            {
              limit: 50,
              orderBy: "created_at",
              orderDirection: "DESC",
            }
          );

          return c.json({ conversations });
        });

        // 2) Get messages for a conversation
        app.get("/api/history", async (c) => {
          const conversationId = c.req.query("conversationId");
          if (!conversationId) {
            return c.json({ error: "conversationId is required" }, 400);
          }

          const messages = await memory.getMessages(
            USER_ID,
            conversationId,
            {
              limit: 50,
             
            }
          );

          return c.json({
            userId: USER_ID,
            conversationId,
            messages,
          });
        });

        // 3) Ingest document text into `documents` table + mark in history
        app.post("/api/documents/ingest", async (c) => {
          const body = await c.req.json();
          const text = String(body.text ?? "");
          const conversationId = body.conversationId ?? null;

          const trimmed = text.trim();
          if (!trimmed) {
            return c.json({ error: "text is required" }, 400);
          }

          // Store in documents vector store (chunked inside ingestDocumentText)
          await ingestDocumentText(trimmed);

          // Also record an event in conversation history
          if (conversationId) {
            const preview =
              trimmed.slice(0, 300) +
              (trimmed.length > 300 ? "..." : "");

            const message: UIMessage = {
              role: "system",
              content:
                "[Document ingested into knowledge base as chunks]\n" +
                preview,
            };

            await memory.addMessage(message as any, USER_ID, conversationId);
          }

          return c.json({ success: true });
        });

        
        // 4) Normal chat with RAG over documents
app.post("/api/chat", async (c) => {
  try {
    const body = await c.req.json();

    const conversationId =
      body.conversationId ?? `conv_${Date.now()}`;

    const action = body.action as "run" | "cancel" | undefined;

    /**
     * IMPORTANT:
     * - chatWorkflow.run() returns WorkflowExecutionResult
     * - Cancellation is NOT supported in-process in this VoltAgent version
     * - Cancel must be signaled via workflow logic (throw)
     */
    const result = await chatWorkflow.run({
      userId: USER_ID,
      conversationId,
      text: String(body.text ?? ""),
      action,
    });

    // ---------- NORMAL / COMPLETED ----------
    return c.json(result);

  } catch (err: any) {
    const msg = String(err?.message ?? "");

    /* ---------- USER CANCEL ---------- */
    if (msg === "WORKFLOW_CANCELLED_BY_USER") {
      return c.json(
        {
          status: "cancelled",
          message: "Workflow cancelled by user",
        },
        200
      );
    }

    /* ---------- APPROVAL REJECTED ---------- */
    if (msg === "APPROVAL_REJECTED") {
      return c.json(
        {
          status: "cancelled",
          message: "Approval was rejected",
        },
        200
      );
    }

    /* ---------- GUARDRAIL ERRORS ---------- */
    if (
      msg.includes("GUARDRAIL") ||
      msg.includes("Input blocked") ||
      msg.includes("Output blocked")
    ) {
      return c.json(
        {
          error: "GUARDRAIL",
          message:
            "Your message violates content rules. Please rephrase and try again.",
        },
        400
      );
    }

    /* ---------- UNKNOWN ERROR ---------- */
    console.error("[/api/chat] error:", err);
    return c.json(
      {
        error: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
      500
    );
  }
});





        // 5) Multimodal / file + question chat (vector chat)
        //    → THIS is what your frontend calls /api/mm-chat
        app.post("/api/mm-chat", async (c) => {
  try {
    const form = await c.req.parseBody();
    const file = form["file"] as File | undefined;
    const question = (form["question"] as string) || "";
    const existingConversationId =
      form["conversationId"] as string | undefined;

    const conversationId =
      existingConversationId || `conv_${Date.now()}`;

    let uploadedText = "";

    if (file) {
      uploadedText = await file.text();
    }

    // ---------- Ingest document (NO guardrail here) ----------
    if (uploadedText.trim()) {
      await ingestDocumentText(uploadedText);

      await memory.addMessage(
        {
          role: "system",
          content:
            "[Document ingested into knowledge base as chunks]\n" +
            uploadedText.slice(0, 300),
        } as any,
        USER_ID,
        conversationId
      );
    }

    const effectiveQuestion =
      question.trim() ||
      (uploadedText
        ? "Summarize the uploaded document."
        : "");

    // If only file upload, no chat yet
    if (!effectiveQuestion) {
      return c.json(
        {
          success: true,
          message: "Document uploaded. You can now ask questions.",
          conversationId,
        },
        200
      );
    }

    // ---------- SAME WORKFLOW (guardrails fire HERE) ----------
    const result = await chatWorkflow.run({
      userId: USER_ID,
      conversationId,
      text: effectiveQuestion,
    });

    return c.json(result);
  } catch (err: any) {
    const msg = String(err?.message ?? "");

    // 🔒 Guardrail → friendly UI error
    if (
      msg.includes("GUARDRAIL") ||
      msg.includes("Input blocked") ||
      msg.includes("Output blocked")
    ) {
      return c.json(
        {
          error: "GUARDRAIL",
          message:
            "Your message or uploaded content violates content rules. Please revise and try again.",
        },
        400
      );
    }

    console.error("[/api/mm-chat] error:", err);
    return c.json(
      {
        error: "INTERNAL_ERROR",
        message: "Something went wrong while processing your request.",
      },
      500
    );
  }
});


         
        
      },
    }),
  });



