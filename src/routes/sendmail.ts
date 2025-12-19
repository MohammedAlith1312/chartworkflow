import type { Context } from "hono";

export function sendEmailRoute(deps: {
  sendGmailWorkflow: {
    run: (input: {
      userId: string;
      conversationId: string;
      to: string;
      subject: string;
      body: string;
    }) => Promise<any>;
  };
  USER_ID: string;
}) {
  const { sendGmailWorkflow, USER_ID } = deps;

  return async (c: Context) => {
    const body = await c.req.json();

    const result = await sendGmailWorkflow.run({
      userId: USER_ID,
      conversationId: `send_mail_${Date.now()}`,
      to: body.to,
      subject: body.subject,
      body: body.body,
    });

    return c.json(result);
  };
}
