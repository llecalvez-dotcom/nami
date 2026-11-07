import { completeJson } from "@/lib/llm";
import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";
import { TranslateInputSchema, translateTexts } from "@/lib/translate";

// Nami's messages in the traveller's spoken language. Nothing is logged: the texts may hold a name or an answer.
export async function POST(request: Request) {
  const lease = guard(request, "translate");
  if (lease instanceof Response) return lease;
  try {
    const body = await readJsonLimited(request, API_LIMITS.translate);
    if (body instanceof Response) return body;
    const input = TranslateInputSchema.safeParse(body.value);
    if (!input.success) return Response.json({ error: "Invalid request" }, { status: 400 });
    try {
      return Response.json({ translations: await translateTexts(input.data, completeJson()) });
    } catch {
      return Response.json({ error: "Translation unavailable." }, { status: 502 });
    }
  } finally {
    lease.release();
  }
}
