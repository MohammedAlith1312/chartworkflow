import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";
import type { Agent, BaseMessage } from "@voltagent/core";
import { searchDocumentsByQuery } from "../vector-store";

export function createUnifiedChatWorkflow(agent: Agent) {
  return createWorkflowChain({
    id: "unified-chat-workflow",
    name: "Unified Chat Workflow",

    input: z.object({
      userId: z.string(),
      conversationId: z.string(),
      text: z.string(),
      action: z.enum(["run", "cancel"]).optional(),
    }),

    resumeSchema: z.object({
      approved: z.boolean(),
    }),

    result: z.object({
      text: z.string(),
      conversationId: z.string(),
    }),
  })

  /* ---------- STEP 1: VALIDATE INPUT ---------- */
  .andThen({
    id: "validate-input",
    execute: async ({ data }) => {
      if (!data.text.trim()) {
        throw new Error("TEXT_REQUIRED");
      }
      return data;
    },
  })

  /* ---------- STEP 2: RAG SEARCH (PURE SCORE-BASED) ---------- */
  .andThen({
    id: "rag-search",
    execute: async ({ data }) => {
      let ragContext = "";

      try {
        const docs = await searchDocumentsByQuery(data.text, 5);

        /**
         * ONLY use RAG when documents are truly relevant.
         * No intent detection.
         * No small-talk rules.
         */
        const relevantDocs = (docs ?? []).filter(
          (d: any) => typeof d.score === "number" && d.score >= 0.75
        );

        if (relevantDocs.length > 0) {
          ragContext = relevantDocs
            .map(
              (d: any, i: number) =>
                `Snippet ${i + 1}:\n${d.content.slice(0, 1000)}`
            )
            .join("\n\n---\n\n")
            .slice(0, 4000);
        }
      } catch {
        // RAG failure must NEVER block chat
      }

      return { ...data, ragContext };
    },
  })

  /* ---------- STEP 3: BUILD MESSAGES ---------- */
  .andThen({
    id: "build-messages",
    execute: async ({ data }) => {
      const messages: BaseMessage[] = [];

      // ✅ RAG MODE (ONLY IF RELEVANT)
      if (data.ragContext) {
        messages.push({
          role: "system",
          content: `
You must answer strictly using the provided document snippets.
If the answer cannot be derived from them, respond with:
"I don't know based on the uploaded documents."
          `.trim(),
        });

        messages.push({
          role: "system",
          content: `DOCUMENT SNIPPETS:\n\n${data.ragContext}`,
        });
      }

      // ✅ GENERAL MODE (DEFAULT)
      if (!data.ragContext) {
        messages.push({
          role: "system",
          content: `
You are a helpful assistant.
Answer the user's question normally using your general knowledge.
          `.trim(),
        });
      }

      messages.push({
        role: "user",
        content: data.text,
      });

      return {
        messages,
        meta: {
          userId: data.userId,
          conversationId: data.conversationId,
        },
        action: data.action,
      };
    },
  })

  /* ---------- STEP 4: SUSPEND / RESUME ---------- */
  .andThen({
    id: "wait-for-approval",
    execute: async ({ data, suspend, resumeData }) => {
      if (data.action === "cancel") {
        throw new Error("WORKFLOW_CANCELLED_BY_USER");
      }

      if (resumeData) {
        if (!resumeData.approved) {
          throw new Error("APPROVAL_REJECTED");
        }
        return data;
      }

      await suspend("Waiting for human approval");
    },
  })

  /* ---------- STEP 5: RUN AGENT ---------- */
  .andThen({
    id: "run-agent",
    execute: async ({ data }) => {
      if (!data) {
        throw new Error("RESUMED_WITHOUT_DATA");
      }

      const { messages, meta } = data;

      const result = await agent.generateText(messages, {
        userId: meta.userId,
        conversationId: meta.conversationId,
        semanticMemory: {
          enabled: true,
          semanticLimit: 10,
          semanticThreshold: 0.6,
        },
      });

      return {
        answer: result.text ?? "",
        conversationId: meta.conversationId,
      };
    },
  })

  /* ---------- STEP 6: FINALIZE ---------- */
  .andThen({
    id: "finalize",
    execute: async ({ data }) => ({
      text: data.answer,
      conversationId: data.conversationId,
    }),
  });
}
