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

type Entry = { root: string; path: string };
const shared = globalThis as typeof globalThis & { namiDocuments?: Map<string, Entry> };
const store = () => shared.namiDocuments ??= new Map<string, Entry>();
const TYPES = new Set([".jpg", ".jpeg", ".png", ".heic", ".pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;

export function documentsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && Boolean(env.NAMI_DOCUMENTS_DIR && isAbsolute(env.NAMI_DOCUMENTS_DIR));
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function scoreName(name: string): number {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return (/passport|passeport|pasaporte|reisepass/.test(normalized) ? 100 : 0)
    + (/id|identity|identite|scan/.test(normalized) ? 10 : 0);
}

export async function findDocuments(): Promise<FoundDocument[]> {
  store().clear();
  if (!documentsEnabled()) return [];
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
      if (!TYPES.has(extname(entry.name).toLowerCase())) continue;
      try {
        const resolved = await realpath(path);
        if (!inside(root, resolved)) continue;
        const info = await stat(resolved);
        if (!info.isFile() || info.size > MAX_BYTES) continue;
        candidates.push({
          path: resolved, name: entry.name, folder: relative(root, directory) || ".",
          size_bytes: info.size, modified_at: info.mtime.toISOString(), score: scoreName(entry.name),
        });
      } catch {
        // Files can disappear while scanning.
      }
    }
  }
  await scan(root, 0);
  const refreshed = new Map<string, Entry>();
  const results = candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5).map(({ path, ...file }) => {
    const id = randomBytes(24).toString("hex");
    refreshed.set(id, { root, path });
    return { id, ...file };
  });
  shared.namiDocuments = refreshed;
  return results;
}

export async function resolveDocumentPath(id: string): Promise<string | null> {
  if (!documentsEnabled() || !/^[a-f0-9]{48}$/.test(id)) return null;
  const entry = store().get(id);
  if (!entry) return null;
  try {
    const root = await realpath(process.env.NAMI_DOCUMENTS_DIR!);
    const path = await realpath(entry.path);
    if (root !== entry.root || !inside(root, path)) return null;
    const info = await stat(path);
    return info.isFile() && info.size <= MAX_BYTES && TYPES.has(extname(path).toLowerCase()) ? path : null;
  } catch {
    return null;
  }
}

export async function documentFilePaths(ids: readonly string[]): Promise<string[] | null> {
  if (!documentsEnabled()) return null;
  const paths = await Promise.all([...new Set(ids)].map(resolveDocumentPath));
  return paths.every((path): path is string => path !== null) ? paths : null;
}
