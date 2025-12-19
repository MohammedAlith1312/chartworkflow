import { createTool } from "@voltagent/core";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* SAFE MATH PARSER (NO eval) */
/* ------------------------------------------------------------------ */

type Operator = "+" | "-" | "*" | "/";

function safeCalculate(expression: string): number {
  const match = expression.trim().match(/^(-?\d+)\s*([+\-*/])\s*(-?\d+)$/);

  if (!match) {
    throw new Error(`Invalid expression: ${expression}`);
  }

  const a = Number(match[1]);
  const op = match[2] as Operator;
  const b = Number(match[3]);

  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) {
        throw new Error("Division by zero");
      }
      return a / b;
  }
}

/* ------------------------------------------------------------------ */
/* TOOL DEFINITION */
/* ------------------------------------------------------------------ */

export const calculatorTool = createTool({
  name: "calculate",
  description: "Perform basic arithmetic calculations",
  parameters: z.object({
    expression: z
      .string()
      .describe("Arithmetic expression like '3 + 5'"),
  }),

  execute: async ({ expression }) => {
    const result = safeCalculate(expression);
    return { result };
  },
});
