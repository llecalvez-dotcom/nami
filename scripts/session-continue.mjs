// Spike for ticket 20: can one H session serve two tasks on the local bridge, and how long is the gap between them?
//
// One session is created with a long idle_timeout_s and a first short task (open about:blank, open the e-VOA home,
// call report_ready). Once the agent has answered and the session is idle, a second task is sent as a message
// (POST /sessions/{id}/messages): open Google Flights, call report_ready. The script logs the time between the end of
// the first task and the first step of the second, and whether the second task still has the browser.
//
// Prerequisites: the agent Chrome on NAMI_AGENT_CHROME_PORT (9333) with `holo local browser` attached to it, its
// session id in NAMI_LOCAL_SESSION_ID, HAI_API_KEY in the environment. Nami itself does not need to run: the script
// talks to the H Agents API directly, with the same agent settings as lib/h-agent.ts.
//
// Usage: node scripts/session-continue.mjs [label]
// Env (optional): NAMI_IDLE_TIMEOUT_S (600), NAMI_AGENT_MODEL (holo4-27b), NAMI_AGENT_REASONING (medium),
//   NAMI_AGENT_SETTLE_S (0.5), HAI_AGENT_NAME, NAMI_RUNS_DIR (~/nami-runs), NAMI_TASK_MAX_S (240).
// Safety: both tasks only open public pages and never fill or submit anything; the session is deleted at the end.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const API = "https://agp.eu.hcompany.ai/api/v2";
const KEY = process.env.HAI_API_KEY;
const BRIDGE = process.env.NAMI_LOCAL_SESSION_ID;
if (!KEY || !BRIDGE) {
  console.error("HAI_API_KEY and NAMI_LOCAL_SESSION_ID are required.");
  process.exit(2);
}
const IDLE_S = Number(process.env.NAMI_IDLE_TIMEOUT_S ?? 600);
const TASK_MAX_S = Number(process.env.NAMI_TASK_MAX_S ?? 240);
const DIR = process.env.NAMI_RUNS_DIR ?? `${homedir()}/nami-runs`;
const label = process.argv[2] ?? "spike";
const EVOA = "https://evisa.imigrasi.go.id/web/visa-selection";
const FLIGHTS = "https://www.google.com/travel/flights?q=Flights%20from%20Paris%20to%20Bali%20on%202026-11-23%20through%202026-12-03&hl=en&curr=EUR";

const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
const log = (...a) => console.log(`[${stamp()}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(DIR, { recursive: true });

async function h(path, init = {}, timeoutMs = 30_000) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const REPORT_READY = {
  name: "report_ready",
  description: "Call once the page asked for is open, without clicking anything on it. This is your last action for this task.",
  input_schema: { type: "object", properties: { summary: { type: "string", description: "Which page is open." } }, required: ["summary"] },
};
const slug = (raw) => (raw ?? "nami").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "nami";
const settle = Number(process.env.NAMI_AGENT_SETTLE_S ?? 0.5);

const TASK_1 = `Open a new tab on about:blank, then in that tab open exactly this URL: ${EVOA}. As soon as the page is displayed, call report_ready with a one line summary. Do not click anything on the page.`;
const TASK_2 = `New task. Switch to the about:blank tab if there is one, otherwise open a new tab. Open exactly this URL: ${FLIGHTS}. As soon as the Google Flights results are displayed, call report_ready with a one line summary. Do not click anything on the page.`;

const body = {
  agent: {
    name: slug(process.env.HAI_AGENT_NAME),
    description: "Nami spike: opens two public pages in the traveller's own Chrome, one task after the other, in one session.",
    model: process.env.NAMI_AGENT_MODEL ?? "holo4-27b",
    reasoning_effort: process.env.NAMI_AGENT_REASONING ?? "medium",
    instructions: "You open the page you are asked to open in the user's browser and call report_ready as soon as it is displayed. You never fill in, submit or click anything else. Each new user message is a new task: the rules of the previous task no longer apply.",
    environments: [{ id: "browser", kind: "web", host: "user_device", session_id: BRIDGE, settle_s: settle, mode: { type: "visual", markdown: true } }],
    tools: [REPORT_READY],
  },
  messages: [{ type: "user_message", message: TASK_1 }],
  queue: false,
  idle_timeout_s: IDLE_S,
  max_time_s: TASK_MAX_S * 2 + IDLE_S,
  max_steps: 40,
};

const timing = { label, idle_timeout_s: IDLE_S, tasks: [] };
const eventTime = (event) => (event.timestamp ? Date.parse(event.timestamp) : Date.now());
const isStep = (event) => event.type === "policy_event" || event.type === "env_event" || /action|step|observation/.test(event.type);

// Polls /changes until report_ready is called (answered) or the session stops; returns what it saw.
async function runTask(id, fromIndex, name, sentAt) {
  const task = { name, sent_at: sentAt, first_event_at: null, first_step_at: null, report_ready_at: null, answered_at: null, status: null, events: 0, saw_browser: false, error: null };
  timing.tasks.push(task);
  let index = fromIndex;
  const deadline = Date.now() + TASK_MAX_S * 1000;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/sessions/${id}/changes?from_index=${index}&wait_for_seconds=20`, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(40_000) });
    if (res.status === 204) continue;
    if (!res.ok) throw new Error(`changes -> ${res.status} ${await res.text()}`);
    const changes = await res.json();
    const events = changes.new_events ?? [];
    for (const event of events) {
      task.events += 1;
      const at = eventTime(event);
      if (task.first_event_at === null) task.first_event_at = at;
      if (task.first_step_at === null && isStep(event)) task.first_step_at = at;
      if (event.type === "policy_event" || /screenshot|observation|env_event/.test(event.type)) task.saw_browser = true;
      const summary = JSON.stringify(event.data ?? {}).slice(0, 140);
      log(`${name} event ${event.type}: ${summary}`);
    }
    index = (changes.first_index ?? index) + events.length;
    task.status = changes.status ?? null;
    if (changes.error) task.error = changes.error;
    for (const call of changes.pending_tool_calls ?? []) {
      if (call.tool_name !== "report_ready") continue;
      task.report_ready_at = Date.now();
      log(`${name} report_ready:`, JSON.stringify(call.args));
      await h(`/sessions/${id}/tool_results`, { method: "POST", body: JSON.stringify({ kind: "tool_result", tool_req: call, result: { ok: true, note: "Thank you. Stop here and answer with the summary." } }) });
    }
    if (changes.status && ["completed", "failed", "timed_out", "interrupted", "idle"].includes(changes.status)) {
      task.answered_at = Date.now();
      log(`${name} session status: ${changes.status}`);
      return { task, index };
    }
    if (task.report_ready_at && Date.now() - task.report_ready_at > 60_000) {
      log(`${name}: report_ready sent 60 s ago and the session is still ${changes.status}; moving on.`);
      task.answered_at = Date.now();
      return { task, index };
    }
  }
  task.error = task.error ?? "task timeout";
  return { task, index };
}

let id = null;
try {
  log("creating the session (idle_timeout_s", IDLE_S + ")");
  const created = await h("/sessions", { method: "POST", body: JSON.stringify(body) });
  id = created.id;
  timing.session_id = id;
  log("session", id, "status", created.status?.status ?? created.status);
  const first = await runTask(id, 0, "task1", Date.now());
  const idleAt = Date.now();

  // Is the session really idle? The status endpoint says so (or not).
  let status = null;
  for (let i = 0; i < 20 && status !== "idle"; i++) {
    status = (await h(`/sessions/${id}/status`)).status;
    if (status !== "idle") await sleep(1000);
  }
  timing.status_after_task1 = status;
  log("status after task 1:", status);

  log("sending task 2 as a message");
  const sentAt = Date.now();
  await h(`/sessions/${id}/messages`, { method: "POST", body: JSON.stringify({ type: "user_message", message: TASK_2 }) });
  timing.message_accepted = true;
  const second = await runTask(id, first.index, "task2", sentAt);
  timing.gap_task1_end_to_task2_first_step_s = second.task.first_step_at ? (second.task.first_step_at - idleAt) / 1000 : null;
  timing.gap_message_to_task2_first_step_s = second.task.first_step_at ? (second.task.first_step_at - sentAt) / 1000 : null;
  timing.task2_has_browser = second.task.saw_browser;
  timing.task2_reached_report_ready = second.task.report_ready_at !== null;
  log("gap end of task 1 -> first step of task 2:", timing.gap_task1_end_to_task2_first_step_s, "s");
  log("task 2 has the browser:", timing.task2_has_browser, "report_ready:", timing.task2_reached_report_ready);
} catch (error) {
  timing.error = error.message;
  log("ERROR:", error.message);
} finally {
  if (id) {
    await h(`/sessions/${id}`, { method: "DELETE" }).then(() => log("session deleted"), (e) => log("delete failed:", e.message));
  }
  const file = `${DIR}/session-continue-${label}.json`;
  writeFileSync(file, JSON.stringify(timing, null, 2));
  log("timing written to", file);
}
