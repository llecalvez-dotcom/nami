import { isIP } from "node:net";
import { isTerminalStatus, type HChanges } from "@/lib/h-agent";

export const SCREEN_MAX_BYTES = 5 * 1024 * 1024;
export const SCREEN_TTL_MS = 5 * 60 * 1000;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
type Image = { type: "url" | "base64"; source: string; media_type: string };
type Entry = { image: Image | null; terminal: boolean; consumed: boolean; expiresAt: number; timer: ReturnType<typeof setTimeout> };
const shared = globalThis as typeof globalThis & { namiAgentScreens?: Map<string, Entry> };
const store = () => shared.namiAgentScreens ??= new Map();

function httpsUrl(source: string): URL | null {
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (isIP(url.hostname) || !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function hHost(url: URL): boolean {
  return url.hostname === "hcompany.ai" || url.hostname.endsWith(".hcompany.ai");
}

function imageFrom(value: unknown): Image | null {
  if (!value || typeof value !== "object") return null;
  const image = value as Record<string, unknown>;
  if (typeof image.source !== "string" || typeof image.media_type !== "string" || !TYPES.has(image.media_type)) return null;
  if (image.type === "url") {
    if (image.source.length > 8192) return null;
    const url = httpsUrl(image.source);
    return url && hHost(url) ? { type: "url", source: url.href, media_type: image.media_type } : null;
  }
  if (image.type === "base64" && image.source.length > 0 && image.source.length <= Math.ceil(SCREEN_MAX_BYTES / 3) * 4
    && image.source.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(image.source)) {
    return { type: "base64", source: image.source, media_type: image.media_type };
  }
  return null;
}

function update(id: string, image: Image | null, terminal: boolean): void {
  const entries = store();
  const previous = entries.get(id);
  if (previous?.consumed) return;
  if (previous) clearTimeout(previous.timer);
  const expiresAt = previous?.terminal ? previous.expiresAt : Date.now() + SCREEN_TTL_MS;
  const entry: Entry = {
    image: image ?? previous?.image ?? null, terminal: terminal || previous?.terminal === true, consumed: false, expiresAt,
    timer: setTimeout(() => { if (entries.get(id) === entry) entries.delete(id); }, Math.max(0, expiresAt - Date.now())),
  };
  entry.timer.unref();
  entries.set(id, entry);
  while (entries.size > 10) {
    const oldest = entries.keys().next().value!;
    clearTimeout(entries.get(oldest)!.timer);
    entries.delete(oldest);
  }
}

export function captureAgentScreen(id: string, changes: HChanges | null): void {
  if (!changes) return;
  let latest: Image | null = null;
  for (const event of changes.new_events) {
    if (event.type !== "AgentEvent" || event.data?.kind !== "observation_event") continue;
    latest = imageFrom(event.data.image) ?? latest;
  }
  if (latest || isTerminalStatus(changes.status)) update(id, latest, isTerminalStatus(changes.status));
}

export function finishAgentScreen(id: string): void {
  update(id, null, true);
}

export function resetAgentScreens(): void {
  for (const entry of store().values()) clearTimeout(entry.timer);
  delete shared.namiAgentScreens;
}

export class ScreenError extends Error {
  constructor(readonly status: number) { super("Screen unavailable."); }
}

async function imageBytes(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new ScreenError(502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get("Content-Length")) > SCREEN_MAX_BYTES) throw new ScreenError(413);
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SCREEN_MAX_BYTES) throw new ScreenError(413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (size === 0) throw new ScreenError(502);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readAgentScreen(id: string, send: typeof fetch = fetch): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
  const entry = store().get(id);
  if (!entry || entry.expiresAt <= Date.now() || !entry.image) return null;
  let delivered = false;
  try {
    const image = entry.image;
    if (image.type === "base64") {
      const bytes = new Uint8Array(Buffer.from(image.source, "base64"));
      if (bytes.byteLength > SCREEN_MAX_BYTES) throw new ScreenError(413);
      delivered = true;
      return { bytes, mediaType: image.media_type };
    }
    let url = httpsUrl(image.source);
    const key = process.env.HAI_API_KEY;
    if (!url || !hHost(url) || !key) throw new ScreenError(502);
    const signal = AbortSignal.timeout(15_000);
    for (let hop = 0; hop <= 3; hop++) {
      const response = await send(url.href, {
        headers: hHost(url) ? { Authorization: `Bearer ${key}` } : {},
        redirect: "manual", cache: "no-store", signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("Location");
        await response.body?.cancel().catch(() => {});
        if (!location || hop === 3) throw new ScreenError(502);
        url = httpsUrl(new URL(location, url).href);
        if (!url) throw new ScreenError(502);
        continue;
      }
      const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      if (!response.ok || !TYPES.has(mediaType)) {
        await response.body?.cancel().catch(() => {});
        throw new ScreenError(response.ok ? 415 : 502);
      }
      const bytes = await imageBytes(response);
      delivered = true;
      return { bytes, mediaType };
    }
    throw new ScreenError(502);
  } finally {
    if (delivered && entry.terminal) { entry.image = null; entry.consumed = true; }
  }
}
