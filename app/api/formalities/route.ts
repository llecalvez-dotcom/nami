import { FormalitiesInputSchema, findFormalities } from "@/lib/formalities";
import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";

export async function POST(request: Request) {
  const lease = guard(request, "formalities");
  if (lease instanceof Response) return lease;

  try {
    const body = await readJsonLimited(request, API_LIMITS.formalities);
    if (body instanceof Response) return body;
    const input = FormalitiesInputSchema.safeParse(body.value);
    if (!input.success) return Response.json({ error: "Invalid request", issues: input.error.issues }, { status: 400 });
    const result = await findFormalities(input.data, { apiKey: process.env.LINKUP_API_KEY });
    if (result.error) console.error("formalities: live search failed:", result.error);
    return Response.json(result);
  } finally {
    lease.release();
  }
}
