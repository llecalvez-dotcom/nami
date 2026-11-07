import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";
import { documentsEnabled, resolveDocumentPath } from "@/lib/documents";
import { configuredReader } from "@/lib/passport";
import { extractPassportImage, passportConsentError, passportImageError } from "@/lib/passport-extraction";

const InputSchema = z.object({ id: z.string().min(1).max(100), consent_provider: z.unknown().optional() });
const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!documentsEnabled()) return fail("Not found.", 404);
  const lease = guard(request, "extract");
  if (lease instanceof Response) {
    lease.headers.set("Cache-Control", "no-store");
    return lease;
  }
  try {
    const read = await readJsonLimited(request, API_LIMITS.extract);
    if (read instanceof Response) return read;
    const input = InputSchema.safeParse(read.value);
    if (!input.success) return fail("Invalid document request.", 400);
    const path = await resolveDocumentPath(input.data.id);
    if (!path) return fail("Document not found. Search again.", 404);
    const reader = configuredReader();
    if (!reader) return fail("Automatic reading is off. Type the fields.", 503);
    const consentError = passportConsentError(reader, input.data.consent_provider);
    if (consentError) return consentError;
    const extension = extname(path).toLowerCase();
    const type = extension === ".png" ? "image/png" : [".jpg", ".jpeg"].includes(extension) ? "image/jpeg" : "";
    const info = await stat(path);
    const imageError = passportImageError(info.size, type);
    if (imageError) return imageError;
    const bytes = await readFile(path);
    return await extractPassportImage(new Blob([new Uint8Array(bytes)], { type }), {}, reader);
  } catch {
    return fail("The document could not be read. Search again or upload a photo.", 502);
  } finally {
    lease.release();
  }
}
