import { z } from "zod";
import { sendToolResult } from "@/lib/h-agent";
import { fillField, localChromeEnabled } from "@/lib/local-chrome";
import { mockDomains } from "@/lib/mock-sites";
import { OFFICIAL_HOSTS } from "@/lib/official-sites";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";

const FillSchema = z.object({
  tool_req: z.object({
    tool_name: z.literal("fill_field"),
    args: z.object({ field: z.string().trim().min(1).max(200), value: z.string().trim().min(1).max(200) }),
    id: z.string().min(1).nullable(),
  }),
});

// Route 7c, local only: writes a text field in the traveller's Chrome with the page's events (the e-VOA postal code
// lookup only runs on keyup), then returns the result to the agent. The value is never logged.
export async function POST(request: Request, ctx: RouteContext<"/api/agent/[id]/fill">) {
  if (!localChromeEnabled()) return fail("Not available.", 404);
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const input = FillSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail("Invalid request.", 400);
  const { field, value } = input.data.tool_req.args;
  const result = await fillField(field, value, [...Object.values(OFFICIAL_HOSTS).flat(), ...mockDomains()]).catch(
    (error: Error) => `${error.message} Call ask_user so that the human types the value of ${field} in Chrome.`,
  );
  try {
    await sendToolResult(id, input.data.tool_req, result);
    return Response.json({ ok: true, result }, { status: 202 });
  } catch (error) {
    return hErrorResponse(error);
  }
}
