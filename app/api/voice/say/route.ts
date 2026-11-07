import { z } from "zod";
import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";
import { macSayEnabled, MAX_SAY_CHARS, say, stopSaying } from "@/lib/voice/mac-say";

const SayInput = z.object({ text: z.string().trim().min(1).max(MAX_SAY_CHARS), language: z.string().regex(/^[a-z]{2,3}$/) });

// GET: whether Nami can speak through the Mac's speakers. POST: say one line, answer once it is said.
export async function GET() {
  return Response.json({ enabled: macSayEnabled() });
}

export async function POST(request: Request) {
  if (!macSayEnabled()) return Response.json({ error: "Not available." }, { status: 404 });
  const lease = guard(request, "say");
  if (lease instanceof Response) return lease;
  try {
    const body = await readJsonLimited(request, API_LIMITS.say);
    if (body instanceof Response) return body;
    const input = SayInput.safeParse(body.value);
    if (!input.success) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ spoken: await say(input.data.text, input.data.language) });
  } finally {
    lease.release();
  }
}

export async function DELETE() {
  if (macSayEnabled()) stopSaying();
  return new Response(null, { status: 204 });
}
