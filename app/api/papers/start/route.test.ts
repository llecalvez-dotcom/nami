import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/papers/start/route";
import { resetGuards } from "@/lib/api-guard";
import { getBaliPaper } from "@/lib/bali-papers";

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
    expect(body.agent.tools.map((t: { name: string }) => t.name)).toEqual(["ask_user", "report_ready"]);
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
