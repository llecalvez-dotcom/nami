import { z } from "zod";

export const AgentAnswerSchema = z.object({
  summary: z.string().trim().min(1),
  filled_fields: z.array(z.string()).optional(),
  missing_fields: z.array(z.string()).optional(),
  blocked_reason: z.string().nullable().optional(),
}).strict();

export const PAPER_ANSWER_FORMAT = z.toJSONSchema(AgentAnswerSchema);
export const INVALID_AGENT_ANSWER = "The agent's final summary could not be verified. Check the official form before continuing.";

export function parseAgentAnswer(answer: unknown): z.infer<typeof AgentAnswerSchema> | null {
  try {
    const parsed = AgentAnswerSchema.safeParse(typeof answer === "string" ? JSON.parse(answer) : answer);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
