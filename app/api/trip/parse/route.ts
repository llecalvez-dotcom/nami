import { completeJson } from "@/lib/llm";
import { ModelOutputError, ParseInputSchema, parseTrip } from "@/lib/trip-parse";
import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";

export async function POST(request: Request) {
  const lease = guard(request, "parse");
  if (lease instanceof Response) return lease;

  try {
    const body = await readJsonLimited(request, API_LIMITS.parse);
    if (body instanceof Response) return body;
    const input = ParseInputSchema.safeParse(body.value);
    if (!input.success) return Response.json({ error: "Invalid request", issues: input.error.issues }, { status: 400 });

    try {
      return Response.json(await parseTrip(input.data, completeJson()));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("trip/parse failed:", message);
      return Response.json(
        { error: error instanceof ModelOutputError ? message : "The language model is unavailable. Try again." },
        { status: 502 },
      );
    }
  } finally {
    lease.release();
  }
}
