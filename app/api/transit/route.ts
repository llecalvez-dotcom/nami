import { findTransitRequirements, TransitInputSchema } from "@/lib/journey/transit";
import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";

export async function POST(request: Request) {
  const lease = guard(request, "transit");
  if (lease instanceof Response) return lease;

  try {
    const body = await readJsonLimited(request, API_LIMITS.transit);
    if (body instanceof Response) return body;
    const input = TransitInputSchema.safeParse(body.value);
    if (!input.success) return Response.json({ error: "Invalid request", issues: input.error.issues }, { status: 400 });
    const result = await findTransitRequirements(input.data, { apiKey: process.env.LINKUP_API_KEY });
    if (result.error) console.error("transit: live search failed:", result.error);
    return Response.json(result);
  } finally {
    lease.release();
  }
}
