import { getBaliPaper } from "@/lib/bali-papers";
import { allowedDocumentType, documentsEnabled, validateDocumentPath } from "@/lib/documents";
import { agentChromePort, connectChrome, type CdpConnection } from "@/lib/chrome-cdp";
import { toolCallKey } from "@/lib/agent-changes";
import { prepareUploadFile } from "@/lib/upload-scan";
import type { ToolRequest } from "@/lib/h-agent";

type UploadResult = "uploaded" | "no official tab" | "no file input found" | "several official tabs open; call ask_user" | typeof ASK_USER | typeof NO_RETURN_TICKET;
const ASK_USER = "Upload unavailable. Call ask_user so the user can upload the file themselves.";
// No confirmed PDF ticket: the agent asks the human and never drops the passport or the photo in the Return Ticket field.
export const NO_RETURN_TICKET = "No return ticket is confirmed in Nami. Call ask_user so the user uploads their return flight ticket (PDF) in the Return Ticket field themselves; never upload another file in its place.";
const TTL_MS = 60 * 60 * 1000;
const TEMPORARY_COPY_MS = 15 * 60 * 1000;
export type UploadPurpose = "passport" | "photo" | "return_ticket";
type SessionDocument = { path: string; photo?: string; returnTicket?: string; expires: number; uploads: Map<string, Promise<UploadResult>> };
const shared = globalThis as typeof globalThis & { namiAgentDocuments?: Map<string, SessionDocument> };
const sessions = () => shared.namiAgentDocuments ??= new Map<string, SessionDocument>();

export function bindSessionDocument(sessionId: string, path: string, photo?: string, returnTicket?: string): void {
  const store = sessions();
  for (const [id, entry] of store) if (entry.expires <= Date.now()) store.delete(id);
  if (store.size >= 1000) store.delete(store.keys().next().value!);
  store.set(sessionId, {
    path, ...(photo ? { photo } : {}), ...(returnTicket ? { returnTicket } : {}), expires: Date.now() + TTL_MS, uploads: new Map(),
  });
}

const PURPOSES: readonly UploadPurpose[] = ["passport", "photo", "return_ticket"];

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
  const purpose = call.args.purpose as UploadPurpose;
  if (!documentsEnabled() || call.tool_name !== "upload_file" || !PURPOSES.includes(purpose)
    || Object.keys(call.args).some((key) => key !== "purpose") || !entry || entry.expires <= Date.now()) return ASK_USER;
  if (purpose === "return_ticket" && !entry.returnTicket) return NO_RETURN_TICKET;
  const confirmedPath = purpose === "photo" ? entry.photo : purpose === "return_ticket" ? entry.returnTicket : entry.path;
  if (!confirmedPath) return ASK_USER;
  const key = toolCallKey(call);
  const previous = entry.uploads.get(key);
  if (previous) return previous;
  const upload = uploadDocument(confirmedPath, purpose, connect);
  entry.uploads.set(key, upload);
  return upload;
}

async function uploadDocument(confirmedPath: string, purpose: UploadPurpose, connect: (port: number) => Promise<CdpConnection>): Promise<UploadResult> {
  let client: CdpConnection | undefined;
  let targetSession: string | undefined;
  let prepared: Awaited<ReturnType<typeof prepareUploadFile>> | undefined;
  try {
    const confirmed = await validateDocumentPath(confirmedPath);
    if (!confirmed) return purpose === "return_ticket" ? NO_RETURN_TICKET : ASK_USER;
    if (purpose === "return_ticket" && !allowedDocumentType(confirmed, "return_ticket")) return NO_RETURN_TICKET;
    prepared = await prepareUploadFile(confirmed);
    const path = prepared.path;
    const port = agentChromePort();
    if (port === null) return ASK_USER;
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
        const purpose = ${JSON.stringify(purpose)};
        if (location.hostname !== domain && !location.hostname.endsWith("." + domain)) return "no official tab";
        const inputs = [...document.querySelectorAll('input[type="file"]')];
        const isVisible = input => {
          const style = getComputedStyle(input);
          return input.getClientRects().length > 0 && style.visibility === "visible"
            && style.display !== "none" && style.opacity !== "0";
        };
        const describe = input => [
          input.id, input.name, input.className, input.getAttribute && input.getAttribute("accept"),
          input.getAttribute && input.getAttribute("aria-label"), input.getAttribute && input.getAttribute("data-name"),
          ...[...(input.labels || [])].map(label => label.textContent),
        ].filter(Boolean).map(String).join(" ").toLowerCase();
        // The return ticket goes to the field named return_ticket (attachment[return_ticket], id attachment-return_ticket) only.
        if (purpose === "return_ticket") {
          const ticketInputs = inputs.filter(input => /return[-_ ]?ticket/.test(String(input.name || "") + " " + String(input.id || "")) && !input.disabled);
          const shownTickets = ticketInputs.filter(isVisible);
          return shownTickets.length === 1 ? shownTickets[0] : ticketInputs.length === 1 ? ticketInputs[0] : null;
        }
        const photoLike = input => /photo|picture|selfie|face|foto/.test(describe(input));
        const candidates = purpose === "photo"
          ? inputs.filter(input => photoLike(input) && !/crop/.test(describe(input)))
          : inputs.filter(input => !photoLike(input) && !/crop|return[-_ ]?ticket/.test(describe(input)));
        const named = purpose === "photo" ? candidates : candidates.filter(input => /pas+por/.test(describe(input)));
        const pool = (named.length > 0 ? named : candidates).filter(input => !input.disabled);
        const shown = pool.filter(isVisible);
        return shown.length === 1 ? shown[0] : pool.length === 1 ? pool[0] : null;
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
    // The page reads the file after the change event (its preview, its own upload): the temporary copy (converted or
    // shrunk) is kept 15 minutes, then deleted. The traveller's original file is never touched.
    if (prepared) setTimeout(() => void prepared?.cleanup(), TEMPORARY_COPY_MS).unref();
    if (client) {
      if (targetSession) {
        await client.send("Runtime.releaseObjectGroup", { objectGroup: "nami-passport-upload" }, targetSession).catch(() => {});
        await client.send("Target.detachFromTarget", { sessionId: targetSession }).catch(() => {});
      }
      client.close();
    }
  }
}
