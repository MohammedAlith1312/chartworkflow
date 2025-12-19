import type { Context } from "hono";

export function getEmailsRoute(deps: {
  gmailGetLatestEmailWorkflow: {
    run: (input: {
      userId: string;
      conversationId: string;
    }) => Promise<any>;
  };
  USER_ID: string;
}) {
  const { gmailGetLatestEmailWorkflow, USER_ID } = deps;

  return async (c: Context) => {
    const result = await gmailGetLatestEmailWorkflow.run({
      userId: USER_ID,
      conversationId: `emails_${Date.now()}`,
    });

    return c.json(result);
  };
}
