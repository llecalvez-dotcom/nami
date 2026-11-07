import { FormalitiesInputSchema, findFormalities } from "@/lib/formalities";

export async function POST(request: Request) {
  const input = FormalitiesInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid request", issues: input.error.issues }, { status: 400 });
  const result = await findFormalities(input.data, { apiKey: process.env.LINKUP_API_KEY });
  if (result.error) console.error("formalities: live search failed:", result.error);
  return Response.json(result);
}
