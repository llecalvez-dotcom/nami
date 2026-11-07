import { randomBytes } from "node:crypto";
import { readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";

export type FoundDocument = {
  id: string;
  name: string;
  folder: string;
  size_bytes: number;
  modified_at: string;
  score: number;
};

export type DocumentKind = "passport" | "photo" | "return_ticket";
export const DOCUMENT_KINDS: readonly DocumentKind[] = ["passport", "photo", "return_ticket"];
type Entry = { root: string; path: string; kind: DocumentKind };
const shared = globalThis as typeof globalThis & { namiDocuments?: Map<string, Entry> };
const store = () => shared.namiDocuments ??= new Map<string, Entry>();
const TYPES = new Set([".jpg", ".jpeg", ".png", ".heic", ".pdf"]);
// The identity photo goes straight to the official site, which accepts images only.
const PHOTO_TYPES = new Set([".jpg", ".jpeg", ".png"]);
// The e-VOA return ticket field accepts application/pdf only: an image is never offered there.
const RETURN_TICKET_TYPES = new Set([".pdf"]);
const TYPES_BY_KIND: Record<DocumentKind, Set<string>> = { passport: TYPES, photo: PHOTO_TYPES, return_ticket: RETURN_TICKET_TYPES };
const MAX_BYTES = 10 * 1024 * 1024;

export function isDocumentKind(value: string | null): value is DocumentKind {
  return DOCUMENT_KINDS.includes(value as DocumentKind);
}

export function documentsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && Boolean(env.NAMI_DOCUMENTS_DIR && isAbsolute(env.NAMI_DOCUMENTS_DIR));
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function scoreName(name: string, kind: DocumentKind): number {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (kind === "return_ticket") {
    return (/billet|ticket|retour|return|flight|vol[-_.]|[-_]vol\b|boarding|itinerai?r/.test(normalized) ? 100 : 0)
      - (/passport|passeport|pasaporte|reisepass|photo/.test(normalized) ? 50 : 0);
  }
  if (kind === "photo") {
    return (/photo|portrait|identite|identity/.test(normalized) ? 100 : 0)
      + (/\bid\b|id[-_.]|[-_]id/.test(normalized) ? 10 : 0)
      - (/passport|passeport|pasaporte|reisepass/.test(normalized) ? 50 : 0);
  }
  return (/passport|passeport|pasaporte|reisepass/.test(normalized) ? 100 : 0)
    + (/(^|[^a-z0-9])(id|identity|identite|scan)(?=[^a-z0-9]|$)/.test(normalized) ? 10 : 0);
}

// A search refreshes the tokens of its own kind only: the confirmed passport survives the photo search.
export async function findDocuments(kind: DocumentKind = "passport"): Promise<FoundDocument[]> {
  const current = store();
  for (const [id, entry] of current) if (entry.kind === kind) current.delete(id);
  if (!documentsEnabled()) return [];
  const types = TYPES_BY_KIND[kind];
  const root = await realpath(process.env.NAMI_DOCUMENTS_DIR!);
  const candidates: (Omit<FoundDocument, "id"> & { path: string })[] = [];
  async function scan(directory: string, depth: number) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (depth === 0) throw error;
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < 2) await scan(path, depth + 1);
        continue;
      }
      if (!types.has(extname(entry.name).toLowerCase())) continue;
      try {
        const resolved = await realpath(path);
        if (!inside(root, resolved)) continue;
        const info = await stat(resolved);
        if (!info.isFile() || info.size > MAX_BYTES) continue;
        candidates.push({
          path: resolved, name: entry.name, folder: relative(root, directory) || ".",
          size_bytes: info.size, modified_at: info.mtime.toISOString(), score: scoreName(entry.name, kind),
        });
      } catch {
        // Files can disappear while scanning.
      }
    }
  }
  await scan(root, 0);
  return candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5).map(({ path, ...file }) => {
    const id = randomBytes(24).toString("hex");
    current.set(id, { root, path, kind });
    return { id, ...file };
  });
}

export function allowedDocumentType(path: string, kind: DocumentKind): boolean {
  return TYPES_BY_KIND[kind].has(extname(path).toLowerCase());
}

// Without a kind (previews), any token resolves; the start route asks for the kind it binds.
export async function resolveDocumentPath(id: string, kind?: DocumentKind): Promise<string | null> {
  if (!documentsEnabled() || !/^[a-f0-9]{48}$/.test(id)) return null;
  const entry = store().get(id);
  if (!entry || (kind !== undefined && entry.kind !== kind)) return null;
  return validateDocumentPath(entry.path, entry.root);
}

export async function validateDocumentPath(filePath: string, expectedRoot?: string): Promise<string | null> {
  if (!documentsEnabled()) return null;
  try {
    const root = await realpath(process.env.NAMI_DOCUMENTS_DIR!);
    const path = await realpath(filePath);
    if ((expectedRoot !== undefined && root !== expectedRoot) || !inside(root, path)) return null;
    const info = await stat(path);
    return info.isFile() && info.size <= MAX_BYTES && TYPES.has(extname(path).toLowerCase()) ? path : null;
  } catch {
    return null;
  }
}

export async function documentFilePaths(ids: readonly string[], kind: DocumentKind = "passport"): Promise<string[] | null> {
  if (!documentsEnabled()) return null;
  const paths = await Promise.all([...new Set(ids)].map((id) => resolveDocumentPath(id, kind)));
  return paths.every((path): path is string => path !== null) ? paths : null;
}
