import { completeJson } from "@/lib/llm";
import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";
import { describeIntent, IntentInputSchema, interpretAnswer } from "@/lib/voice/intent";

// What a spoken answer means: accept, decline, one of the options, or free text. One log line per call for the bench.
export async function POST(request: Request) {
  const lease = guard(request, "intent");
  if (lease instanceof Response) return lease;
  try {
    const body = await readJsonLimited(request, API_LIMITS.intent);
    if (body instanceof Response) return body;
    const input = IntentInputSchema.safeParse(body.value);
    if (!input.success) return Response.json({ error: "Invalid request" }, { status: 400 });

    const startedAt = Date.now();
    const intent = await interpretAnswer(input.data, completeJson());
    const heard = input.data.transcript.length > 40 ? `${input.data.transcript.slice(0, 40)}…` : input.data.transcript;
    console.log(`voice/intent "${heard}" → ${describeIntent(intent)} (${intent.confidence}) ${Date.now() - startedAt} ms`);
    return Response.json(intent);
  } finally {
    lease.release();
  }
}
