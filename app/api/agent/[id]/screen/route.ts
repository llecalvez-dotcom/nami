import { guard } from "@/lib/api-guard";
import { readAgentScreen, ScreenError } from "@/lib/agent-screen";
import { SESSION_ID } from "@/lib/paper-agent";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
const fail = (status: number) => Response.json({ error: "Screen unavailable." }, { status, headers });

export async function GET(request: Request, ctx: RouteContext<"/api/agent/[id]/screen">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail(400);
  const lease = guard(request, "screen");
  if (lease instanceof Response) { lease.headers.set("Cache-Control", "no-store"); return lease; }
  try {
    const screen = await readAgentScreen(id);
    return screen ? new Response(new Uint8Array(screen.bytes), { headers: { ...headers, "Content-Type": screen.mediaType } }) : fail(404);
  } catch (error) {
    return fail(error instanceof ScreenError ? error.status : 502);
  } finally {
    lease.release();
  }
}
