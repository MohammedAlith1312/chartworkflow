import "dotenv/config";
import {
  VoltAgent,
  Agent,
  Memory,
  createWorkflowChain,
  VoltOpsClient,
} from "@voltagent/core";
import { PostgreSQLMemoryAdapter } from "@voltagent/postgres";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { honoServer } from "@voltagent/server-hono";
import { z } from "zod";

/* ---------------- Tools ---------------- */
import { weatherTool, calculatorTool, getLocationTool } from "./tools";

/* ---------------- Guardrails ---------------- */
import { blockWordsGuardrail } from "./Guardrail/words";
import { sanitizeGuardrail } from "./Guardrail/sanitize";
import { validationGuardrail } from "./Guardrail/validation";
import { digitGuardrail } from "./Guardrail/digitts";

/* ---------------- Gmail ---------------- */
import { registerGmailTrigger } from "./triggers/gmail";
import { gmailGetLatestEmailWorkflow } from "./actions/gmail";

/* ---------------- Routes ---------------- */
import { conversationsRoute } from "./routes/conversation";
import { historyRoute } from "./routes/history";
import { chatRoute } from "./routes/chat";
import { deleteConversationRoute } from "./routes/conversationdelete";
import { getEmailsRoute } from "./routes/getmail";
import { sendEmailRoute } from "./routes/sendmail";
import { getLiveEvalsRoute } from "./routes/eval";
/* ---------------- Live Eval ---------------- */
import { pool, initLiveEvalTable } from "./db/live-eval";

/* ✅ NEW EVAL SCORERS */
import { logicalReasoningLiveScorer } from "./evals/reasoningLiveScorer";
import { mathLiveScorer } from "./evals/mathLiveScorer";
import { toolUsageLiveScorer } from "./evals/toolUsageLiveScorer";

import { withToolTelemetry } from "./telemetry/withToolTelemetry";
import { withInputGuardrailTelemetry, withOutputGuardrailTelemetry } from "./telemetry/withGuardrailTelemetry";
import { initTelemetryTable } from "./db/telemetry";
import { telemetryToolsRoute } from "./routes/telemetry-tools";
import { telemetryGuardrailsRoute } from "./routes/telemetry-guardrails";

await initTelemetryTable();

/* ======================================================
   INTERNAL TYPE (IMPORTANT)
   ====================================================== */

type LiveEvalResult = {
  scorerId: string;
  score: number;
  metadata?: Record<string, unknown>;
  passed?: boolean;
  context?: {
    conversationId?: string;
    agentName?: string;
    environment?: string;
  };
};

/* ======================================================
   OpenRouter
   ====================================================== */

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

/* ======================================================
   Memory
   ====================================================== */

export const memory = new Memory({
  storage: new PostgreSQLMemoryAdapter({
    connection: process.env.DATABASE_URL!,
  }),
});

/* ======================================================
   VoltOps
   ====================================================== */

const voltops = new VoltOpsClient({
  publicKey: process.env.VOLTAGENT_PUBLIC_KEY!,
  secretKey: process.env.VOLTAGENT_SECRET_KEY!,
});

/* ======================================================
   Gmail Workflow
   ====================================================== */

export const sendGmailWorkflow = createWorkflowChain({
  id: "send-gmail-workflow",
  name: "Send Gmail Email",
  input: z.object({
    userId: z.string(),
    conversationId: z.string(),
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  result: z.object({
    status: z.enum(["EMAIL_SENT", "FAILED"]),
    errorMessage: z.string().optional(),
  }),
}).andThen({
  id: "send-email",
  execute: async ({ data }) => {
    try {
      await voltops.actions.gmail.sendEmail({
        credential: { credentialId: process.env.CREDENTIAL_ID! },
        to: data.to,
        subject: data.subject,
        textBody: data.body,
      });
      return { status: "EMAIL_SENT" };
    } catch (err: unknown) {
      return {
        status: "FAILED",
        errorMessage: String(err),
      };
    }
  },
});

/* ======================================================
   Agent (LIVE EVALS – FINAL & CORRECT)
   ====================================================== */



   async function persistLiveEval(result: any) {
  const conversationId =
    typeof result?.context?.conversationId === "string"
      ? result.context.conversationId
      : null;

  await pool.query(
    `
    INSERT INTO live_eval_results
      (conversation_id, scorer_id, score, passed, metadata)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      conversationId,
      result.scorerId,
      result.score ?? 0,
      result.passed ?? false,
      result.metadata ?? {},
    ]
  );
}


export const agent = new Agent({
  name: "sample-app",
  model: openrouter.chat("nvidia/nemotron-3-nano-30b-a3b:free"),
  memory,
  tools: [
    withToolTelemetry(weatherTool),
    withToolTelemetry(calculatorTool),
    withToolTelemetry(getLocationTool),
  ],
  inputGuardrails: [
    withInputGuardrailTelemetry(blockWordsGuardrail, "block-words"),
    withInputGuardrailTelemetry(sanitizeGuardrail, "sanitize"),
    withInputGuardrailTelemetry(validationGuardrail, "validation"),
  ],
  outputGuardrails: [
    withOutputGuardrailTelemetry(digitGuardrail, "digit"),
  ],
  eval: {
    triggerSource: "production",
    environment: "backend-api",
    sampling: { type: "ratio", rate: 1 },

    scorers: {
      reasoning: {
        scorer: logicalReasoningLiveScorer,
        onResult: persistLiveEval,
      },
      math: {
        scorer: mathLiveScorer,
        onResult: persistLiveEval,
      },
      tools: {
        scorer: toolUsageLiveScorer,
        onResult: persistLiveEval,
      },
    },
  },

  instructions: `
You are a helpful AI assistant.
Answer ONLY based on the conversation.
`,
});


/* ======================================================
   Startup
   ====================================================== */

const USER_ID = "mohammed-alith";
const PORT = Number(process.env.PORT) || 5000;

await initTelemetryTable();
await initLiveEvalTable();
registerGmailTrigger(gmailGetLatestEmailWorkflow);

new VoltAgent({
  agents: { "sample-app": agent },
  workflows: {
    "send-gmail-workflow": sendGmailWorkflow,
    "gmail-get-latest-email": gmailGetLatestEmailWorkflow,
  },
  server: honoServer({
    port: PORT,
    configureApp(app) {
      // Chat routes
      app.post("/api/chat", chatRoute({ agent, memory, USER_ID }));
      
      // Conversation routes
      app.get("/api/conversations", conversationsRoute({ memory, USER_ID }));
      app.get("/api/conversations/:conversationId/history", historyRoute({ memory, USER_ID }));
      
      // Delete routes - unified approach
      app.delete("/api/conversations/:conversationId", deleteConversationRoute({ memory, USER_ID }));
      
      // Email routes
      app.get("/api/emails", getEmailsRoute({ gmailGetLatestEmailWorkflow, USER_ID }));
      app.post("/api/emails/send", sendEmailRoute({ sendGmailWorkflow, USER_ID }));
      
      // Live evaluations
app.get("/api/evals/live", getLiveEvalsRoute());
      // Telemetry routes
      app.get("/api/telemetry/tools", telemetryToolsRoute());
      app.get("/api/telemetry/guardrails", telemetryGuardrailsRoute());
    },
  }),
});

console.log(`🚀 Server running on port ${PORT}`);