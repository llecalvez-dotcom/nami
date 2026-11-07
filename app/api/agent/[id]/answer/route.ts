import { z } from "zod";
import { sendToolResult } from "@/lib/h-agent";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";

const AnswerSchema = z.object({
  tool_req: z.object({
    tool_name: z.enum(["ask_user", "report_ready"]),
    args: z.record(z.string(), z.unknown()).default({}),
    id: z.string().min(1).nullable(),
  }),
  result: z.string().trim().min(1).max(2000),
});

// Route 7: answer of the human (ask_user) or "ok" (report_ready). The answer is never logged.
export async function POST(request: Request, ctx: RouteContext<"/api/agent/[id]/answer">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const input = AnswerSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail("Invalid answer.", 400);
  try {
    await sendToolResult(id, input.data.tool_req, input.data.result);
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return hErrorResponse(error);
  }
}
