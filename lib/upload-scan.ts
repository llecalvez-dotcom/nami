import { randomBytes } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

export const MAX_SIDE_PX = 2000;

export type PreparedUpload = { path: string; cleanup: () => Promise<void> };

// The official site reads the scan itself and rejects huge photos: a JPEG or PNG longer than 2000 px on a side is
// shrunk into a temporary file (long side 2000 px, JPEG quality 90), deleted after the upload. Nothing is logged.
export async function prepareUploadFile(path: string, maxSide = MAX_SIDE_PX): Promise<PreparedUpload> {
  const keep = { path, cleanup: async () => {} };
  if (![".jpg", ".jpeg", ".png"].includes(extname(path).toLowerCase())) return keep;
  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(path, { failOn: "none" }).rotate();
    const { width = 0, height = 0 } = await image.metadata();
    if (Math.max(width, height) <= maxSide) return keep;
    const buffer = await image.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 }).toBuffer();
    const temporary = join(tmpdir(), `nami-upload-${randomBytes(12).toString("hex")}.jpg`);
    await writeFile(temporary, buffer, { mode: 0o600 });
    return { path: temporary, cleanup: () => unlink(temporary).catch(() => {}) };
  } catch {
    return keep;
  }
}
