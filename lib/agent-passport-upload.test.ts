import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindSessionDocument, uploadSessionDocument } from "@/lib/agent-passport-upload";
import { findDocuments } from "@/lib/documents";
import type { ToolRequest } from "@/lib/h-agent";

const CALL: ToolRequest = { tool_name: "upload_file", args: { purpose: "passport" }, id: "upload-1" };
const DOMAIN = "evisa.imigrasi.go.id";
let root: string;
let path: string;
let documentId: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "nami-upload-fictitious-")));
  path = join(root, "passport-fictitious.jpg");
  await writeFile(path, "fictitious image");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NAMI_DOCUMENTS_DIR", root);
  vi.stubEnv("NAMI_AGENT_CHROME_PORT", "");
  const [document] = await findDocuments();
  documentId = document.id;
  bindSessionDocument("session-1", documentId);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

function mockChrome(visibility: boolean[], nativeEvents = true, hostname = DOMAIN) {
  const objects = new Map<string, unknown>();
  const inputs = visibility.map((visible, index) => {
    const input = Object.assign(new EventTarget(), {
      visible, disabled: false, isConnected: true, files: [] as string[],
      matches: (selector: string) => selector === 'input[type="file"]',
      getClientRects: () => visible ? [{}] : [],
    });
    objects.set("input-" + index, input);
    return input;
  });
  const counts = { input: 0, change: 0 };
  for (const input of inputs) {
    input.addEventListener("input", () => counts.input++);
    input.addEventListener("change", () => counts.change++);
  }
  let url = "https://" + hostname + "/form";
  const targets = [
    { targetId: "personal", type: "page", url: "https://example.com" },
    { targetId: "lookalike", type: "page", url: "https://evisa.imigrasi.go.id.evil.example" },
    { targetId: "official", type: "page", url },
  ];
  const send = vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
    if (method === "Target.getTargets") return { targetInfos: targets };
    if (method === "Target.attachToTarget") return { sessionId: "target-session" };
    if (method === "Runtime.evaluate") {
      const result = new Function("location", "document", "getComputedStyle", "return " + params.expression)(
        new URL(url), { querySelectorAll: () => inputs },
        (input: { visible: boolean }) => ({ visibility: "visible", display: input.visible ? "block" : "none", opacity: "1" }),
      );
      const index = inputs.indexOf(result);
      return { result: index >= 0 ? { objectId: "input-" + index } : { value: result } };
    }
    if (method === "Runtime.callFunctionOn") {
      const args = params.arguments as { value?: unknown; objectId?: string }[];
      const fn = new Function("location", "return (" + params.functionDeclaration + ")")(new URL(url));
      const value = fn.apply(objects.get(String(params.objectId)), args.map((arg) =>
        arg.objectId ? objects.get(arg.objectId) : arg.value));
      if (params.returnByValue) return { result: { value } };
      if (value === null) return { result: { value: null } };
      objects.set("events", value);
      return { result: { objectId: "events" } };
    }
    if (method === "DOM.setFileInputFiles") {
      const input = inputs[Number(String(params.objectId).split("-")[1])];
      input.files = params.files as string[];
      if (nativeEvents) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    return {};
  });
  const close = vi.fn();
  return { send, close, inputs, counts, targets, navigate: (next: string) => { url = next; },
    connect: vi.fn(async () => ({ send, close })) };
}

describe("session-bound CDP passport upload", () => {
  it("selects the official tab among others, uses only the bound path and closes its connection", async () => {
    const chrome = mockChrome([true]);
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("uploaded");
    expect(chrome.connect).toHaveBeenCalledExactlyOnceWith(9222);
    expect(chrome.send).toHaveBeenCalledWith("Target.attachToTarget", { targetId: "official", flatten: true });
    expect(chrome.send).toHaveBeenCalledWith("DOM.setFileInputFiles",
      { objectId: "input-0", files: [path] }, "target-session");
    expect(chrome.counts).toEqual({ input: 1, change: 1 });
    expect(chrome.close).toHaveBeenCalledOnce();
  });

  it("supports the configured port and official subdomains", async () => {
    vi.stubEnv("NAMI_AGENT_CHROME_PORT", "9333");
    const chrome = mockChrome([true], true, "apply." + DOMAIN);
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("uploaded");
    expect(chrome.connect).toHaveBeenCalledWith(9333);
  });

  it("refuses several official tabs before attaching or uploading", async () => {
    const chrome = mockChrome([true]);
    chrome.targets.push({ targetId: "another-official", type: "page", url: "https://apply." + DOMAIN + "/form" });
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("several official tabs open; call ask_user");
    expect(chrome.send).toHaveBeenCalledTimes(1);
    expect(chrome.close).toHaveBeenCalledOnce();
  });

  it.each([[], [true, true], [false, false]])("refuses missing or ambiguous file inputs: %j", async (...values) => {
    const chrome = mockChrome(values as boolean[]);
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("no file input found");
    expect(chrome.send.mock.calls.some(([method]) => method === "DOM.setFileInputFiles")).toBe(false);
    expect(chrome.close).toHaveBeenCalledOnce();
  });

  it.each([[false], [false, true, false]])("uses the sole input or sole visible input: %j", async (...values) => {
    const chrome = mockChrome(values as boolean[]);
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("uploaded");
    const selected = values.indexOf(true) >= 0 ? values.indexOf(true) : 0;
    expect(chrome.inputs[selected].files).toEqual([path]);
  });

  it("dispatches input and change only when CDP did not already fire them", async () => {
    const chrome = mockChrome([true], false);
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("uploaded");
    expect(chrome.counts).toEqual({ input: 1, change: 1 });
  });

  it("refuses nonofficial tabs and lookalike hosts", async () => {
    const chrome = mockChrome([true], true, DOMAIN + ".evil.example");
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("no official tab");
    expect(chrome.send).toHaveBeenCalledTimes(1);
    expect(chrome.close).toHaveBeenCalledOnce();
  });

  it("rechecks the domain after attaching, before touching the file input", async () => {
    const chrome = mockChrome([true]);
    chrome.navigate("https://example.com");
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("no official tab");
    expect(chrome.send.mock.calls.some(([method]) => method === "DOM.setFileInputFiles")).toBe(false);
  });

  it.each(["production", "disabled", "photo", "unknown", "expired", "path"])("hands over without connecting: %s", async (reason) => {
    const chrome = mockChrome([true]);
    let call = CALL;
    if (reason === "production") vi.stubEnv("NODE_ENV", "production");
    if (reason === "disabled") vi.stubEnv("NAMI_DOCUMENTS_DIR", "");
    if (reason === "photo") call = { ...CALL, args: { purpose: "photo" } };
    if (reason === "path") call = { ...CALL, args: { purpose: "passport", path: "/not-confirmed.jpg" } };
    if (reason === "expired") await findDocuments();
    expect(await uploadSessionDocument(reason === "unknown" ? "unknown" : "session-1", call, chrome.connect))
      .toContain("ask_user");
    expect(chrome.connect).not.toHaveBeenCalled();
  });

  it("reuses the result for the same tool call so an H acknowledgment retry does not upload twice", async () => {
    const chrome = mockChrome([true]);
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("uploaded");
    expect(await uploadSessionDocument("session-1", CALL, chrome.connect)).toBe("uploaded");
    expect(chrome.connect).toHaveBeenCalledOnce();
  });

  it("keeps a different session's document inaccessible", async () => {
    const chrome = mockChrome([true]);
    bindSessionDocument("session-other", "unknown");
    expect(await uploadSessionDocument("session-other", CALL, chrome.connect)).toContain("ask_user");
    expect(chrome.connect).not.toHaveBeenCalled();
  });

  it("hides CDP errors and refuses invalid ports", async () => {
    const log = vi.spyOn(console, "error");
    const connect = vi.fn(async () => { throw new Error(path); });
    expect(await uploadSessionDocument("session-1", CALL, connect)).not.toContain(path);
    expect(log).not.toHaveBeenCalled();
    bindSessionDocument("session-1", documentId);
    vi.stubEnv("NAMI_AGENT_CHROME_PORT", "99999");
    expect(await uploadSessionDocument("session-1", CALL, connect)).toContain("ask_user");
    expect(connect).toHaveBeenCalledOnce();
  });
});
