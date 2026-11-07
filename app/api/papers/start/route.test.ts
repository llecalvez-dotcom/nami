import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/papers/start/route";
import { resetGuards } from "@/lib/api-guard";
import { getBaliPaper } from "@/lib/bali-papers";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findDocuments } from "@/lib/documents";
import { uploadSessionDocument } from "@/lib/agent-passport-upload";

const PASSPORT = {
  surname: "MARTIN",
  given_names: "Camille",
  nationality: "FR",
  birth_date: "1990-04-12",
  passport_number: "24AB12345",
  issue_date: "2020-02-03",
  expiry_date: "2030-02-02",
};
const REQUEST = {
  raw_text: "Je pars à Bali lundi",
  nationality: "FR",
  origin_country: "FR",
  destination: "Bali",
  country_iso2: "ID",
  departure_date: "2026-11-09",
  arrival_at: "2026-11-10T14:30+08:00",
  return_date: "2026-11-20",
  purpose: "tourism",
  travellers: 1,
  status: "planning",
};
const BODY = {
  request: REQUEST,
  passport: PASSPORT,
  paper_id: "evoa",
  local_session_id: "local-42",
  file_paths: ["private/passeport.jpg", "private/photo.jpg"],
};

const start = (body: unknown) =>
  POST(new Request("http://localhost/api/papers/start", { method: "POST", body: JSON.stringify(body) }));

let fetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetGuards();
  vi.stubEnv("HAI_API_KEY", "h-key");
  vi.stubEnv("HAI_AGENT_NAME", "nami-agent");
  fetch = vi.fn(async (url: string) => url.endsWith("/quota")
    ? Response.json({ scope: "organization", limit: 3, active: 0, available: 3 })
    : Response.json({ id: "s-1", status: { status: "pending" } }, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sentBody = () => JSON.parse((fetch.mock.calls.find(([, init]) => init.method === "POST") as unknown as [string, RequestInit])[1].body as string);

describe("quota and idempotency", () => {
  const key = "00000000-0000-4000-8000-000000000001";

  it.each([0, -1])("refuses creation when available slots are %s", async (available) => {
    fetch.mockResolvedValue(Response.json({ scope: "organization", limit: 3, active: 3, available }));
    const response = await start(BODY);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "All H agent slots are busy. Stop another agent or wait, then try again." });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("https://agp.eu.hcompany.ai/api/v2/sessions/quota");
  });

  it("proceeds if quota is unavailable, without logging its body", async () => {
    const log = vi.spyOn(console, "error");
    fetch.mockResolvedValueOnce(new Response("private quota details", { status: 404 }));
    expect((await start(BODY)).status).toBe(201);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(log).not.toHaveBeenCalled();
  });

  it("forwards a validated UUID as a header and preserves legacy requests without one", async () => {
    expect((await start({ ...BODY, idempotency_key: key })).status).toBe(201);
    const calls = fetch.mock.calls.filter(([, init]) => init.method === "POST");
    expect(new Headers(calls[0][1].headers).get("Idempotency-Key")).toBe(key);
    expect(sentBody()).not.toHaveProperty("idempotency_key");
    expect(sentBody().agent.answer_format).toMatchObject({ type: "object", required: ["summary"] });
    expect((await start(BODY)).status).toBe(201);
    const legacy = fetch.mock.calls.filter(([, init]) => init.method === "POST")[1];
    expect(new Headers(legacy[1].headers).has("Idempotency-Key")).toBe(false);
  });

  it.each(["not-a-uuid", "", "x".repeat(256)])("rejects invalid UUID %s before calling H", async (idempotency_key) => {
    expect((await start({ ...BODY, idempotency_key })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps a create-time quota race to the same busy message after bounded retries", async () => {
    fetch.mockImplementation(async (url: string) => url.endsWith("/quota") ? Response.json({ available: 1 })
      : new Response("private task echo", { status: 429, headers: { "Retry-After": "0" } }));
    const response = await start({ ...BODY, idempotency_key: key });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "All H agent slots are busy. Stop another agent or wait, then try again." });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("lets a resumed keyed start reach H even when no slot is free, so H can return the original session", async () => {
    fetch.mockImplementation(async (url: string) => url.endsWith("/quota") ? Response.json({ available: 0 })
      : Response.json({ id: "s-1", status: { status: "running" } }, { status: 201 }));
    const response = await start({ ...BODY, idempotency_key: key, resume: true });
    expect(response.status).toBe(201);
    expect((await response.json()).session_id).toBe("s-1");
    expect((await start({ ...BODY, idempotency_key: key })).status).toBe(429);
  });
});

describe("passport document handoff", () => {
  let root: string;
  let documentId: string;
  const filename = "passport-fictitious.jpg";

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), "nami-agent-passport-")));
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NAMI_DOCUMENTS_DIR", root);
    await writeFile(join(root, filename), "fictitious image bytes");
    const [document] = await findDocuments();
    documentId = document.id;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolves the opaque id, appends its path once and never returns or logs private values", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const response = await start({ ...BODY, document_id: documentId });
    expect(response.status).toBe(201);
    const task: string = sentBody().messages[0].message;
    expect(task).toContain(`private/passeport.jpg, private/photo.jpg, ${join(root, filename)}`);
    const text = await response.text();
    expect(text).not.toContain(root);
    expect(text).not.toContain(filename);
    expect(text).not.toContain(PASSPORT.passport_number);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("deduplicates the resolved path against existing file_paths", async () => {
    const path = join(root, filename);
    expect((await start({ ...BODY, file_paths: [path, path], document_id: documentId })).status).toBe(201);
    const task: string = sentBody().messages[0].message;
    expect(task.split(path)).toHaveLength(2);
  });

  it("binds the resolved file at start so a later search does not break the upload", async () => {
    expect((await start({ ...BODY, document_id: documentId })).status).toBe(201);
    await findDocuments();
    const send = vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
      if (method === "Target.getTargets") return {
        targetInfos: [{ type: "page", targetId: "official", url: "https://evisa.imigrasi.go.id/form" }],
      };
      if (method === "Target.attachToTarget") return { sessionId: "target" };
      if (method === "Runtime.evaluate") return { result: { objectId: "input" } };
      if (method === "Runtime.callFunctionOn") return {
        result: params.returnByValue ? { value: true } : { objectId: "events" },
      };
      return {};
    });
    const connect = vi.fn(async () => ({ send, close: vi.fn() }));
    expect(await uploadSessionDocument("s-1",
      { tool_name: "upload_file", args: { purpose: "passport" }, id: "upload-bound" }, connect)).toBe("uploaded");
    expect(send).toHaveBeenCalledWith("DOM.setFileInputFiles",
      { objectId: "input", files: [join(root, filename)] }, "target");
    expect(connect).toHaveBeenCalledOnce();
  });

  it.each(["unknown", "../passport.jpg", "", "x".repeat(101)])("rejects an invalid id without calling H: %s", async (document_id) => {
    const response = await start({ ...BODY, document_id });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "The passport document is no longer available. Search for your passport again.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an expired id after another search without calling H", async () => {
    await findDocuments();
    const response = await start({ ...BODY, document_id: documentId });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Search for your passport again.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["unconfigured", "production"])("rejects the document when search is disabled: %s", async (setting) => {
    if (setting === "production") vi.stubEnv("NODE_ENV", "production");
    else vi.stubEnv("NAMI_DOCUMENTS_DIR", "");
    const response = await start({ ...BODY, document_id: documentId });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Search for your passport again.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the legacy flow working without document_id when search is disabled", async () => {
    vi.stubEnv("NAMI_DOCUMENTS_DIR", "");
    const response = await start(BODY);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ session_id: "s-1", status: "pending" });
    expect(sentBody().messages[0].message).toContain("private/passeport.jpg, private/photo.jpg");
    expect(sentBody().messages[0].message).not.toContain(root);
  });

  it("does not leak the resolved path if H rejects session creation", async () => {
    const log = vi.spyOn(console, "error");
    fetch.mockImplementation(async () => new Response(join(root, filename) + PASSPORT.passport_number, { status: 422 }));
    const response = await start({ ...BODY, document_id: documentId });
    expect(response.status).toBe(502);
    const text = await response.text() + JSON.stringify(log.mock.calls);
    expect(text).not.toContain(root);
    expect(text).not.toContain(filename);
    expect(text).not.toContain(PASSPORT.passport_number);
  });
});

describe("POST /api/papers/start (route 5)", () => {
  it("creates the H session on the local browser and returns its id", async () => {
    const response = await start(BODY);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ session_id: "s-1", status: "pending" });
    const body = sentBody();
    expect(body.queue).toBe(false);
    expect(body.max_time_s).toBe(900);
    expect(body.max_steps).toBe(80);
    expect(body.agent.environments).toEqual([
      { id: "browser", kind: "web", host: "user_device", session_id: "local-42", settle_s: 2, mode: { type: "visual", markdown: true } },
    ]);
    expect(body.agent.tools.map((t: { name: string }) => t.name)).toEqual(["ask_user", "report_ready", "pick_option", "upload_file"]);
    expect(body.agent.tools[0].input_schema.required).toEqual(["question", "field"]);
    expect(body.agent.tools[1].input_schema.required).toEqual(["summary", "filled_fields"]);
  });

  it("gives the agent the forbidden buttons, the stop condition, the files and the passport", async () => {
    await start(BODY);
    const task: string = sentBody().messages[0].message;
    const evoa = getBaliPaper("evoa");
    expect(task).toContain(evoa.official_url);
    expect(task).toContain(`Never leave the domain ${evoa.domain}`);
    for (const button of evoa.forbidden_buttons) expect(task).toContain(button);
    expect(task).toContain(evoa.stop_condition);
    expect(task).toContain("private/passeport.jpg, private/photo.jpg");
    expect(task).toContain("Passport number: 24AB12345");
    expect(task).toContain("Arrival: 2026-11-10T14:30+08:00");
    expect(task).toContain("Purpose: tourism.");
  });

  it("logs nothing and never sends the task back", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const response = await start(BODY);
    expect(await response.text()).not.toContain("24AB12345");
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ["without local_session_id", { ...BODY, local_session_id: undefined }, "Missing local browser session"],
    ["with an empty local_session_id", { ...BODY, local_session_id: "  " }, "Missing local browser session"],
    ["for another paper than the e-VOA", { ...BODY, paper_id: "arrival_card" }, "Only the Bali e-VOA"],
    ["without paper_id", { ...BODY, paper_id: undefined }, "Only the Bali e-VOA"],
    ["without passport", { ...BODY, passport: undefined }, "passport"],
  ])("refuses %s", async (_label, body, message) => {
    const response = await start(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(message);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is behind api-guard: low quota of H sessions per client", async () => {
    for (let i = 0; i < 5; i += 1) expect((await start(BODY)).status).toBe(201);
    const response = await start(BODY);
    expect(response.status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it("answers 429 when another H session runs", async () => {
    fetch.mockImplementation(async () => new Response("quota", { status: 429, headers: { "Retry-After": "0" } }));
    const response = await start(BODY);
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("All H agent slots are busy");
  });

  it("answers 502 without the H body on a refused session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetch.mockImplementation(async () => new Response("echo 24AB12345", { status: 422 }));
    const response = await start(BODY);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("24AB12345");
  });
});
