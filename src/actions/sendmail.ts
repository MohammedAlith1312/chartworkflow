import { createWorkflowChain, VoltOpsClient } from "@voltagent/core";
import { z } from "zod";

const voltops = new VoltOpsClient({
  publicKey: process.env.VOLTAGENT_PUBLIC_KEY!,
  secretKey: process.env.VOLTAGENT_SECRET_KEY!,
});

export const sendGmailWorkflow = createWorkflowChain({
  id: "send-gmail-workflow",
  name: "Send Gmail Email",
  purpose: "Send a single Gmail email via VoltOps",

  input: z.object({
    userId: z.string(),
    conversationId: z.string(),
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),

  result: z.object({
    status: z.enum(["EMAIL_SENT", "FAILED"]),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
})

.andThen({
  id: "send-email",
  execute: async ({ data }) => {
    try {
      await voltops.actions.gmail.sendEmail({
        credential: {
          credentialId: process.env.CREDENTIAL_ID!,
        },
        to: data.to,
        subject: data.subject,
        textBody: data.body,
      });

      /* ---------- SUCCESS ---------- */
      return {
        status: "EMAIL_SENT",
      };
    } catch (err: any) {
      /* ---------- ERROR ---------- */
      return {
        status: "FAILED",
        errorCode: err?.code ?? "GMAIL_SEND_FAILED",
        errorMessage: String(err?.message ?? err),
      };
    }
  },
});
