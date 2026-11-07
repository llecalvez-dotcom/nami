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
  fetch = vi.fn(async () => Response.json({ id: "s-1", status: { status: "pending" } }, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sentBody = () => JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);

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

  it("binds the created session to the confirmed document for later server-side uploads", async () => {
    expect((await start({ ...BODY, document_id: documentId })).status).toBe(201);
    const connect = vi.fn(async () => ({
      send: vi.fn(async () => ({ targetInfos: [] })),
      close: vi.fn(),
    }));
    expect(await uploadSessionDocument("s-1",
      { tool_name: "upload_file", args: { purpose: "passport" }, id: "upload-bound" }, connect)).toBe("no official tab");
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
    expect(body.agent.environments).toEqual([{ id: "browser", kind: "web", host: "user_device", session_id: "local-42" }]);
    expect(body.agent.tools.map((t: { name: string }) => t.name)).toEqual(["ask_user", "report_ready", "upload_file"]);
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
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("answers 429 when another H session runs", async () => {
    fetch.mockImplementation(async () => new Response("quota", { status: 429 }));
    const response = await start(BODY);
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("Another H agent session");
  });

  it("answers 502 without the H body on a refused session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetch.mockImplementation(async () => new Response("echo 24AB12345", { status: 422 }));
    const response = await start(BODY);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("24AB12345");
  });
});
