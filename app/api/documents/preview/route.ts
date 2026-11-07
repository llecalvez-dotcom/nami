import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import sharp from "sharp";
import { documentsEnabled, resolveDocumentPath } from "@/lib/documents";
import { guard } from "@/lib/api-guard";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number) => Response.json({ error: "Preview unavailable." }, { status, headers });

export async function GET(request: Request) {
  if (!documentsEnabled()) return fail(404);
  const lease = guard(request, "documents");
  if (lease instanceof Response) {
    lease.headers.set("Cache-Control", "no-store");
    return lease;
  }
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const path = await resolveDocumentPath(id);
    if (!path) return fail(404);
    if (![".jpg", ".jpeg", ".png"].includes(extname(path).toLowerCase())) return fail(415);
    const bytes = await readFile(path);
    const preview = await sharp(bytes).rotate().resize(480, 480, { fit: "inside", withoutEnlargement: true }).jpeg().toBuffer();
    return new Response(new Uint8Array(preview), { headers: { ...headers, "Content-Type": "image/jpeg" } });
  } catch {
    return fail(415);
  } finally {
    lease.release();
  }
}
