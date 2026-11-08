import { z } from "zod";
import { sendToolResult } from "@/lib/h-agent";
import { localChromeEnabled, pickOption } from "@/lib/local-chrome";
import { mockDomains } from "@/lib/mock-sites";
import { OFFICIAL_HOSTS } from "@/lib/official-sites";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";

const PickSchema = z.object({
  tool_req: z.object({
    tool_name: z.literal("pick_option"),
    args: z.object({ field: z.string().max(200).default(""), option: z.string().trim().min(1).max(200) }),
    id: z.string().min(1).nullable(),
  }),
});

// Route 7b, local only: picks a dropdown option in the traveller's Chrome, then returns the result to the agent.
export async function POST(request: Request, ctx: RouteContext<"/api/agent/[id]/pick">) {
  if (!localChromeEnabled()) return fail("Not available.", 404);
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const input = PickSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail("Invalid request.", 400);
  const { field, option } = input.data.tool_req.args;
  const result = await pickOption(field, option, [...Object.values(OFFICIAL_HOSTS).flat(), ...mockDomains()]).catch(
    (error: Error) => `${error.message} Call ask_user so that the human picks ${option} in Chrome.`,
  );
  try {
    await sendToolResult(id, input.data.tool_req, result);
    return Response.json({ ok: true, result }, { status: 202 });
  } catch (error) {
    return hErrorResponse(error);
  }
}
