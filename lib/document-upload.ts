import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { join } from "node:path";
import { documentsEnabled, DOCUMENT_KINDS, MAX_DOCUMENT_BYTES, registerDocument, type DocumentKind, type FoundDocument } from "@/lib/documents";
import { MAX_IMAGE_BYTES } from "@/lib/passport";
import { convertHeic, isHeic } from "@/lib/upload-scan";

// The upload zone: when Nami finds no passport, ID photo or return ticket on this computer, the traveller drops one.
// The file is written in NAMI_DOCUMENTS_DIR (never elsewhere) under a name Nami chooses: the client's name is ignored.

export const UPLOAD_FOLDER = "nami-uploads";
export const MAX_UPLOAD_BYTES = MAX_DOCUMENT_BYTES;
export type UploadType = "jpg" | "png" | "heic" | "pdf";
// The passport is read by extract-found, which takes JPEG and PNG images up to MAX_IMAGE_BYTES (HEIC becomes a JPEG).
export const MAX_PASSPORT_BYTES = MAX_IMAGE_BYTES;

// What each reader or field of the official site takes: the ID photo and the return ticket are handed over as they are.
const TYPES_BY_KIND: Record<DocumentKind, readonly UploadType[]> = {
  passport: ["jpg", "png", "heic"],
  photo: ["jpg", "png", "heic"],
  return_ticket: ["pdf"],
};

export type UploadRefusal = { error: string; status: 400 | 413 | 415 };

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

// The type comes from the first bytes, never from the name or the declared MIME type.
export function sniffUploadType(bytes: Uint8Array): UploadType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(8, 12))) return "heic";
  return null;
}

export function refuseUpload(kind: string | null, bytes: Uint8Array): UploadRefusal | { kind: DocumentKind; type: UploadType } {
  if (!DOCUMENT_KINDS.includes(kind as DocumentKind)) return { error: "Unsupported document kind.", status: 400 };
  if (bytes.length === 0) return { error: "No file received.", status: 400 };
  const max = kind === "passport" ? MAX_PASSPORT_BYTES : MAX_UPLOAD_BYTES;
  if (bytes.length > max) return { error: `File too large (${max / (1024 * 1024)} MB max).`, status: 413 };
  const type = sniffUploadType(bytes);
  const allowed = TYPES_BY_KIND[kind as DocumentKind];
  if (!type || !allowed.includes(type)) {
    const list = kind === "return_ticket" ? "a PDF" : kind === "photo" ? "a JPEG, PNG or HEIC photo" : "a JPEG, PNG or HEIC photo of your passport";
    return { error: `Send ${list}.`, status: 415 };
  }
  return { kind: kind as DocumentKind, type };
}

// uploaded-<kind>-<timestamp>-<salt>.<ext>: safe characters only, a name the search of its kind scores first, and two
// files sent in the same millisecond never collide.
export function uploadFileName(kind: DocumentKind, type: UploadType, now: Date = new Date(), salt: string = randomBytes(2).toString("hex")): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return `uploaded-${kind.replace("_", "-")}-${stamp}-${salt}.${type}`;
}

// wx: never over an existing file, readable by the owner only.
async function writeNew(path: string, bytes: Uint8Array): Promise<string> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  return path;
}

// Writes the file and returns it as the search would: a token for the panel, a name, a folder, a score.
export async function saveUploadedDocument(kind: DocumentKind, type: UploadType, bytes: Uint8Array, now: Date = new Date()): Promise<FoundDocument | null> {
  if (!documentsEnabled()) return null;
  const root = await realpath(process.env.NAMI_DOCUMENTS_DIR!);
  const folder = join(root, UPLOAD_FOLDER);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const path = await writeNew(join(folder, uploadFileName(kind, type, now)), bytes);
  // iPhone photos are HEIC, which neither the passport readers nor the official site accept: a JPEG copy is kept
  // instead when the Mac can make one (sips); elsewhere the file is refused rather than kept unreadable.
  if (type === "heic" && (await isHeic(path))) {
    const converted = await convertHeic(path);
    if (!converted) {
      await unlink(path).catch(() => {});
      return null;
    }
    const jpeg = await writeNew(join(folder, uploadFileName(kind, "jpg", now)), await readFile(converted.path).finally(converted.cleanup));
    await unlink(path).catch(() => {});
    return registerDocument(jpeg, kind);
  }
  return registerDocument(path, kind);
}
