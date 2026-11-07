import { getBaliPaper } from "@/lib/bali-papers";
import { documentsEnabled, validateDocumentPath } from "@/lib/documents";
import { connectChrome, type CdpConnection } from "@/lib/chrome-cdp";
import { toolCallKey } from "@/lib/agent-changes";
import type { ToolRequest } from "@/lib/h-agent";

type UploadResult = "uploaded" | "no official tab" | "no file input found" | "several official tabs open; call ask_user" | typeof ASK_USER;
const ASK_USER = "Upload unavailable. Call ask_user so the user can upload the file themselves.";
const TTL_MS = 60 * 60 * 1000;
type SessionDocument = { path: string; expires: number; uploads: Map<string, Promise<UploadResult>> };
const shared = globalThis as typeof globalThis & { namiAgentDocuments?: Map<string, SessionDocument> };
const sessions = () => shared.namiAgentDocuments ??= new Map<string, SessionDocument>();

export function bindSessionDocument(sessionId: string, path: string): void {
  const store = sessions();
  for (const [id, entry] of store) if (entry.expires <= Date.now()) store.delete(id);
  if (store.size >= 1000) store.delete(store.keys().next().value!);
  store.set(sessionId, { path, expires: Date.now() + TTL_MS, uploads: new Map() });
}

function official(url: string, domain: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol)
      && (parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

type RemoteResult = { result: { objectId?: string; value?: unknown }; exceptionDetails?: unknown };

export async function uploadSessionDocument(
  sessionId: string,
  call: ToolRequest,
  connect: (port: number) => Promise<CdpConnection> = connectChrome,
): Promise<UploadResult> {
  const entry = sessions().get(sessionId);
  if (!documentsEnabled() || call.tool_name !== "upload_file" || call.args.purpose !== "passport"
    || Object.keys(call.args).some((key) => key !== "purpose") || !entry || entry.expires <= Date.now()) return ASK_USER;
  const key = toolCallKey(call);
  const previous = entry.uploads.get(key);
  if (previous) return previous;
  const upload = uploadPassport(entry.path, connect);
  entry.uploads.set(key, upload);
  return upload;
}

async function uploadPassport(confirmedPath: string, connect: (port: number) => Promise<CdpConnection>): Promise<UploadResult> {
  let client: CdpConnection | undefined;
  let targetSession: string | undefined;
  try {
    const path = await validateDocumentPath(confirmedPath);
    if (!path) return ASK_USER;
    const rawPort = process.env.NAMI_AGENT_CHROME_PORT || "9222";
    if (!/^\d+$/.test(rawPort)) return ASK_USER;
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return ASK_USER;
    client = await connect(port);
    const domain = getBaliPaper("evoa").domain;
    const targets = await client.send("Target.getTargets") as {
      targetInfos: { type: string; targetId: string; url: string }[];
    };
    const tabs = targets.targetInfos.filter((target) => target.type === "page" && official(target.url, domain));
    if (tabs.length > 1) return "several official tabs open; call ask_user";
    const tab = tabs[0];
    if (!tab) return "no official tab";
    const attached = await client.send("Target.attachToTarget", { targetId: tab.targetId, flatten: true }) as {
      sessionId: string;
    };
    targetSession = attached.sessionId;
    const found = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const domain = ${JSON.stringify(domain)};
        if (location.hostname !== domain && !location.hostname.endsWith("." + domain)) return "no official tab";
        const inputs = [...document.querySelectorAll('input[type="file"]')];
        const visible = inputs.filter(input => {
          const style = getComputedStyle(input);
          return input.getClientRects().length > 0 && style.visibility === "visible"
            && style.display !== "none" && style.opacity !== "0";
        });
        const input = visible.length === 1 ? visible[0] : inputs.length === 1 ? inputs[0] : null;
        return input && !input.disabled ? input : null;
      })()`,
      objectGroup: "nami-passport-upload",
    }, targetSession) as RemoteResult;
    if (found.result.value === "no official tab") return "no official tab";
    if (found.exceptionDetails || !found.result.objectId) return "no file input found";
    const objectId = found.result.objectId;
    const armed = await client.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(domain) {
        if (!this.isConnected || !this.matches('input[type="file"]') || this.disabled
          || (location.hostname !== domain && !location.hostname.endsWith("." + domain))) return null;
        const events = { input: false, change: false };
        this.addEventListener("input", () => { events.input = true; }, { once: true, capture: true });
        this.addEventListener("change", () => { events.change = true; }, { once: true, capture: true });
        return events;
      }`,
      arguments: [{ value: domain }],
      objectGroup: "nami-passport-upload",
    }, targetSession) as RemoteResult;
    if (armed.exceptionDetails || !armed.result.objectId) return "no official tab";
    await client.send("DOM.setFileInputFiles", { objectId, files: [path] }, targetSession);
    const finished = await client.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(events, domain) {
        if (!this.isConnected || (location.hostname !== domain && !location.hostname.endsWith("." + domain))) return false;
        if (!events.input) this.dispatchEvent(new Event("input", { bubbles: true }));
        if (!events.change) this.dispatchEvent(new Event("change", { bubbles: true }));
        return this.files.length === 1;
      }`,
      arguments: [{ objectId: armed.result.objectId }, { value: domain }],
      returnByValue: true,
    }, targetSession) as RemoteResult;
    return !finished.exceptionDetails && finished.result.value === true ? "uploaded" : ASK_USER;
  } catch {
    return ASK_USER;
  } finally {
    if (client) {
      if (targetSession) {
        await client.send("Runtime.releaseObjectGroup", { objectGroup: "nami-passport-upload" }, targetSession).catch(() => {});
        await client.send("Target.detachFromTarget", { sessionId: targetSession }).catch(() => {});
      }
      client.close();
    }
  }
}
