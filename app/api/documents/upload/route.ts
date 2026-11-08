import { API_LIMITS, guard, readBodyLimited } from "@/lib/api-guard";
import { documentsEnabled } from "@/lib/documents";
import { refuseUpload, saveUploadedDocument } from "@/lib/document-upload";

const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

// Multipart form: `file` (JPEG, PNG, HEIC or PDF) and `kind` (passport | photo | return_ticket). The file is written in
// NAMI_DOCUMENTS_DIR and answered as /api/documents/find would list it, so the panel resumes as if it had been found.
export async function POST(request: Request) {
  if (!documentsEnabled()) return fail("Not found.", 404);
  const lease = guard(request, "upload");
  if (lease instanceof Response) {
    lease.headers.set("Cache-Control", "no-store");
    return lease;
  }
  try {
    const read = await readBodyLimited(request, API_LIMITS.upload);
    if (read instanceof Response) return read;
    if (!read.bytes) return fail("Expected a multipart form with a file.", 400);
    let form: FormData;
    try {
      form = await new Request(request.url, { method: "POST", headers: request.headers, body: new Blob([read.bytes]) }).formData();
    } catch {
      return fail("Expected a multipart form with a file.", 400);
    }
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof Blob) || typeof kind !== "string") return fail("Expected a multipart form with a file.", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = refuseUpload(kind, bytes);
    if ("error" in checked) return fail(checked.error, checked.status);
    const document = await saveUploadedDocument(checked.kind, checked.type, bytes);
    if (!document) return fail("This HEIC file could not be converted here. Send a JPEG or PNG.", 415);
    return Response.json(document, { headers });
  } catch {
    return fail("The file could not be saved. Try again.", 500);
  } finally {
    lease.release();
  }
}
