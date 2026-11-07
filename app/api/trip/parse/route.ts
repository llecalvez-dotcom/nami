import { completeJson } from "@/lib/llm";
import { ModelOutputError, ParseInputSchema, parseTrip } from "@/lib/trip-parse";

export async function POST(request: Request) {
  const input = ParseInputSchema.safeParse(await request.json().catch(() => null));
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
}
