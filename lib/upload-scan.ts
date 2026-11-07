import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, open, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

export const MAX_SIDE_PX = 2000;

export type PreparedUpload = { path: string; cleanup: () => Promise<void> };

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

// iPhone photos are HEIC, sometimes saved under a .jpg name (measured on 2026-11-07: the ID photo of the demo). Neither
// sharp nor the official site reads HEIC, so it is recognised by its first bytes, never by its name.
export async function isHeic(path: string): Promise<boolean> {
  let file;
  try {
    file = await open(path, "r");
    const head = Buffer.alloc(12);
    const { bytesRead } = await file.read(head, 0, 12, 0);
    return bytesRead === 12 && head.toString("latin1", 4, 8) === "ftyp" && HEIC_BRANDS.has(head.toString("latin1", 8, 12));
  } catch {
    return false;
  } finally {
    await file?.close();
  }
}

// A real JPEG copy of a HEIC image in a temporary file, made by sips on the Mac of the demo; null anywhere else or on failure.
export async function convertHeic(path: string): Promise<PreparedUpload | null> {
  if (process.platform !== "darwin") return null;
  const temporary = join(tmpdir(), `nami-heic-${randomBytes(12).toString("hex")}.jpg`);
  const cleanup = () => unlink(temporary).catch(() => {});
  try {
    await promisify(execFile)("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", path, "--out", temporary], { timeout: 20_000 });
    await chmod(temporary, 0o600);
    return { path: temporary, cleanup };
  } catch {
    await cleanup();
    return null;
  }
}

// The official site reads the scan itself and rejects huge photos: a JPEG or PNG longer than 2000 px on a side is
// shrunk into a temporary file (long side 2000 px, JPEG quality 90), deleted after the upload. A HEIC image is first
// converted to a JPEG. Nothing is logged.
export async function prepareUploadFile(path: string, maxSide = MAX_SIDE_PX): Promise<PreparedUpload> {
  const keep = { path, cleanup: async () => {} };
  if (![".jpg", ".jpeg", ".png", ".heic"].includes(extname(path).toLowerCase())) return keep;
  if (await isHeic(path)) {
    const converted = await convertHeic(path);
    if (!converted) return keep;
    const resized = await prepareUploadFile(converted.path, maxSide);
    if (resized.path === converted.path) return converted;
    await converted.cleanup();
    return resized;
  }
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
