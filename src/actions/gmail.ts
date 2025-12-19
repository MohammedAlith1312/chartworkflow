import { createWorkflowChain, VoltOpsClient } from "@voltagent/core";
import { z } from "zod";

/* ---------------- VoltOps Client ---------------- */

const voltops = new VoltOpsClient({
  publicKey: process.env.VOLTAGENT_PUBLIC_KEY!,
  secretKey: process.env.VOLTAGENT_SECRET_KEY!,
});

/* ---------------- Helpers ---------------- */

function decodeBase64(data?: string): string {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- Workflow ---------------- */

export const gmailGetLatestEmailWorkflow = createWorkflowChain({
  id: "gmail-get-latest-email",
  name: "Get Latest Gmail Email",
  purpose: "Fetch the most recent Gmail inbox email (from, to, subject, body)",

  input: z.object({
    userId: z.string(),
    conversationId: z.string(),
  }),

  result: z.object({
    status: z.enum(["EMAIL_FOUND", "NO_EMAIL"]),
    from: z.string().optional(),
    to: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
  }),
})

.andThen({
  id: "fetch-latest-email",
  execute: async () => {
    /* ---------- STEP 1: Search ---------- */
    const searchResult = await voltops.actions.gmail.searchEmail({
      credential: {
        credentialId: process.env.CREDENTIAL_ID!,
      },
      query: "in:inbox",
      maxResults: 1,
    });

    const searchPayload = searchResult as unknown as {
      messages?: { id: string }[];
    };

    const messageId = searchPayload.messages?.[0]?.id;
    if (!messageId) {
      return { status: "NO_EMAIL" };
    }

    /* ---------- STEP 2: Get Email ---------- */
    const emailResult = await voltops.actions.gmail.getEmail({
      credential: {
        credentialId: process.env.CREDENTIAL_ID!,
      },
      messageId,
      format: "full",
    });

    const email = emailResult as unknown as {
      payload?: {
        headers?: { name: string; value: string }[];
        body?: { data?: string };
        parts?: { mimeType?: string; body?: { data?: string } }[];
      };
    };

    const headers = email.payload?.headers ?? [];

    const from = headers.find(h => h.name === "From")?.value ?? "";
    const to = headers.find(h => h.name === "To")?.value ?? "";
    const subject = headers.find(h => h.name === "Subject")?.value ?? "";

    /* ---------- BODY ---------- */
    let bodyHtml = "";

    if (email.payload?.parts?.length) {
      const htmlPart = email.payload.parts.find(
        p => p.mimeType === "text/html"
      );
      if (htmlPart?.body?.data) {
        bodyHtml = decodeBase64(htmlPart.body.data);
      }
    }

    if (!bodyHtml && email.payload?.body?.data) {
      bodyHtml = decodeBase64(email.payload.body.data);
    }

    const body = htmlToText(bodyHtml);

    return {
      status: "EMAIL_FOUND",
      from,
      to,
      subject,
      body,
    };
  },
});
