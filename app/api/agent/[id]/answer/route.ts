import { z } from "zod";
import { sendToolResult } from "@/lib/h-agent";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";
import { uploadSessionDocument } from "@/lib/agent-passport-upload";

const AnswerSchema = z.object({
  tool_req: z.object({
    tool_name: z.enum(["ask_user", "upload_file"]),
    args: z.record(z.string(), z.unknown()).default({}),
    id: z.string().min(1).nullable(),
  }),
  result: z.string().trim().min(1).max(2000),
});

// Route 7: human answers and upload results. The answer is never logged.
export async function POST(request: Request, ctx: RouteContext<"/api/agent/[id]/answer">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const input = AnswerSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail("Invalid answer.", 400);
  if (input.data.tool_req.tool_name === "upload_file"
    && !z.object({ purpose: z.enum(["passport", "photo"]) }).strict().safeParse(input.data.tool_req.args).success) {
    return fail("Invalid upload request.", 400);
  }
  try {
    const uploadResult = input.data.tool_req.tool_name === "upload_file"
      ? await uploadSessionDocument(id, input.data.tool_req)
      : undefined;
    const result = uploadResult === "uploaded"
      ? "uploaded. Do not reload or refresh the page or navigate away; take a screenshot to verify the file is shown, then continue with the next field."
      : uploadResult ?? input.data.result;
    await sendToolResult(id, input.data.tool_req, result);
    return Response.json({ ok: true, ...(uploadResult ? { upload_result: uploadResult } : {}) }, { status: 202 });
  } catch (error) {
    return hErrorResponse(error);
  }
}
