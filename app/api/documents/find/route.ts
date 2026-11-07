import { documentsEnabled, findDocuments } from "@/lib/documents";
import { guard } from "@/lib/api-guard";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!documentsEnabled()) return Response.json({ error: "Not found." }, { status: 404, headers });
  const lease = guard(request, "documents");
  if (lease instanceof Response) {
    lease.headers.set("Cache-Control", "no-store");
    return lease;
  }
  try {
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind === null) return Response.json({ enabled: true }, { headers });
    if (kind !== "passport") return Response.json({ error: "Unsupported document kind." }, { status: 400, headers });
    return Response.json({ documents: await findDocuments() }, { headers });
  } catch {
    return Response.json({ error: "Documents could not be searched. You can upload a file instead." }, { status: 500, headers });
  } finally {
    lease.release();
  }
}
