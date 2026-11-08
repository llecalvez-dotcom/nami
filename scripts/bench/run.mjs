// Ticket 0: one full typed trip through Nami's own routes, as the side panel does, measured. No microphone: the
// trip is a sentence, every "yes" is immediate, the agent runs in the agent's Chrome against the mock official sites
// (fixtures/sites, NAMI_MOCK_SITES=on) for the papers and the real public Google Flights / Hotels pages for the rest.
//
// Usage: node scripts/bench/run.mjs <label> [runs=1]
//   label  folder bench/<label>/ (one <run>.json per run, summary.md at the end)
//   runs   at most 3 per PR (H has 3 session slots shared with the team); NAMI_BENCH_FORCE=1 lifts the cap.
// Env: NAMI_URL (http://localhost:3000), NAMI_AGENT_CHROME_PORT (9333), NAMI_LOCAL_SESSION_ID (else .env.local, else
//   ~/.config/nami/local-browser-session-id), HAI_API_KEY (to wait for a free H slot), NAMI_MOCK_SITES_PORT (3100),
//   NAMI_DOCUMENTS_DIR (fixtures/test-documents: its manifest.json names the passport to use), NAMI_BENCH_DIR (bench),
//   NAMI_BENCH_TASK_MAX_S (600), NAMI_DEMO_EMAIL / NAMI_DEMO_PHONE / NAMI_DEMO_ADDRESS (answers to ask_user).
// Safety: every session is ended when its task ends (report_ready), on any error, and when the script is interrupted.
// Nothing is booked or paid: Google tasks end on the booking / prices page, the mocks record any forbidden click.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { verdict } from "./mock-recorder.mjs";
import { loadRuns, summaryTable } from "./report.mjs";

const BASE = process.env.NAMI_URL ?? "http://localhost:3000";
const CDP = `http://127.0.0.1:${process.env.NAMI_AGENT_CHROME_PORT ?? "9333"}`;
const MOCK_PORT = process.env.NAMI_MOCK_SITES_PORT ?? "3100";
const MOCKS = { visa: `http://evoa.test.localhost:${MOCK_PORT}`, arrival_card: `http://allindonesia.test.localhost:${MOCK_PORT}` };
const EXPECTED_STEP = { visa: "step-1", arrival_card: "personal-information" };
const DOCS = resolve(process.env.NAMI_DOCUMENTS_DIR ?? "fixtures/test-documents");
const BENCH = resolve(process.env.NAMI_BENCH_DIR ?? "bench");
const TASK_MAX_MS = Number(process.env.NAMI_BENCH_TASK_MAX_S ?? 600) * 1000;
const H_API = "https://agp.eu.hcompany.ai/api/v2";
const label = process.argv[2];
const runs = Number(process.argv[3] ?? 1);
if (!label || !Number.isInteger(runs) || runs < 1) {
  console.error("Usage: node scripts/bench/run.mjs <label> [runs]");
  process.exit(2);
}
if (runs > 3 && !process.env.NAMI_BENCH_FORCE) {
  console.error("At most 3 runs per PR (H budget). Set NAMI_BENCH_FORCE=1 to insist.");
  process.exit(2);
}
const DIR = join(BENCH, label);
mkdirSync(DIR, { recursive: true });

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error ?? ""}`);
  return json;
}

function envLocal(name) {
  try {
    const line = readFileSync(resolve(".env.local"), "utf8").split("\n").reverse().find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).replace(/^["']|["']$/g, "").trim() : "";
  } catch {
    return "";
  }
}
const localId = process.env.NAMI_LOCAL_SESSION_ID?.trim() || envLocal("NAMI_LOCAL_SESSION_ID")
  || (existsSync(`${homedir()}/.config/nami/local-browser-session-id`) ? readFileSync(`${homedir()}/.config/nami/local-browser-session-id`, "utf8").trim() : "");
if (!localId) {
  console.error("No NAMI_LOCAL_SESSION_ID (the bridge's session id): run scripts/bench/setup.sh first.");
  process.exit(2);
}

// --- Sessions are always ended: the current one on error or Ctrl+C, every one at the end of its task.
let currentSession = null;
async function endSession(reason = "stop", toolReq) {
  if (!currentSession) return;
  const id = currentSession;
  currentSession = null;
  await call("POST", `/api/agent/${id}/cancel`, { reason, ...(toolReq ? { tool_req: toolReq } : {}) }).catch((e) => log("cancel failed:", e.message));
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => { log(signal, "received: ending the session"); await endSession(); process.exit(130); });
}

// --- H slots: wait for a free one instead of failing (3 shared with the team).
async function waitForSlot() {
  if (!process.env.HAI_API_KEY) return;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${H_API}/sessions/quota`, { headers: { Authorization: `Bearer ${process.env.HAI_API_KEY}` }, signal: AbortSignal.timeout(10_000) });
      const quota = await res.json();
      if ((quota.available ?? 1) > 0) return;
      log(`H slots busy (${quota.active}/${quota.limit}), waiting 10 s`);
    } catch (e) {
      log("quota check failed:", e.message);
      return;
    }
    await sleep(10_000);
  }
}

async function tabUrls(test) {
  try {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    return list.filter((t) => t.type === "page" && test(t.url)).map((t) => t.url);
  } catch {
    return [];
  }
}
const mockReset = (task) => fetch(`${MOCKS[task]}/__mock/reset`, { method: "POST" }).then(() => true, () => false);
const mockResult = (task) => fetch(`${MOCKS[task]}/__mock/result`).then((r) => r.json(), () => null);

// --- The traveller's answers to ask_user: demo values, never anything real, never a submit.
const AUTO = [
  [/e-?mail/i, process.env.NAMI_DEMO_EMAIL ?? "specimen.test@example.com"],
  [/phone|telephone|mobile/i, `Use ${process.env.NAMI_DEMO_PHONE ?? "+33600000000"} (demo number; nothing will be submitted).`],
  [/address|residence|hotel|accommodation|stay/i, process.env.NAMI_DEMO_ADDRESS ?? "Hotel in Kuta, Jalan Pantai Kuta 1, postal code 80361. Residence type HOTEL."],
  [/return ticket|return flight/i, "There is no return ticket yet; leave that upload empty and continue; never upload any other file there."],
  [/flight number|vessel/i, "Flight number GA 123 (demo value)."],
  [/port of entry|airport|denpasar/i, "Bali's airport is listed as NGURAH RAI AIRPORT. Call pick_option with field Port of Entry and option NGURAH RAI AIRPORT, then continue."],
  [/passport_country|prancis/i, "PRANCIS is the Indonesian name of FRANCE: it is correct. Leave it unchanged and continue."],
  [/purpose/i, "Holiday / Leisure (a friend's wedding)."],
  [/birth|place of birth/i, "PARIS."],
];
const answerFor = (args) => AUTO.find(([re]) => re.test(`${args.field ?? ""} ${args.question ?? ""}`))?.[1] ?? "I do not know; leave this field empty and continue without it.";

const newTask = (name) => ({ name, started_at: null, first_step_at: null, ended_at: null, success: false, end: null, h_steps: 0, h_cost: null, questions: 0, recoveries: 0, forbidden_clicks: 0, continued: null, notes: [] });

// Follows one H session like the panel: tools are executed through Nami's routes, the task ends at report_ready.
async function follow(task, sid, startBody, handlers, isDone) {
  let next = startBody.from_index ?? 0;
  let steps = 0;
  let last = null;
  const handled = new Set();
  const key = (c) => c.id ?? `${c.tool_name}:${JSON.stringify(c.args)}`;
  const deadline = Date.now() + TASK_MAX_MS;
  while (Date.now() < deadline) {
    let ch;
    try {
      ch = await call("GET", `/api/agent/${sid}/changes?from_index=${next}`);
    } catch (e) {
      log("poll error:", e.message);
      await sleep(2000);
      continue;
    }
    last = ch;
    next = ch.next_index;
    for (const s of ch.steps) {
      steps += 1;
      if (task.first_step_at === null && !/^Session created|^Agent started|^Opened Google/.test(s)) task.first_step_at = now();
      if (/A step failed|retries|starting again|stalled/i.test(s)) task.recoveries += 1;
      log(`${task.name} step ${steps}:`, s);
    }
    if (ch.metrics) {
      task.h_steps = ch.metrics.steps ?? task.h_steps;
      task.h_cost = ch.metrics.total_cost ?? task.h_cost;
    }
    if (ch.left_official_site) task.notes.push(`left the site: ${ch.left_official_site}`);
    if (ch.error_code === "stalled") { task.recoveries += 1; task.notes.push("stalled"); }
    const paid = await tabUrls((u) => /payment|checkout|bayar|pembayaran|\/booking\//i.test(u));
    if (paid.length) {
      task.notes.push(`watchdog: ${paid[0]}`);
      await endSession();
      task.end = "watchdog";
      break;
    }
    const calls = ch.pending_tool_calls.filter((c) => !handled.has(key(c)));
    const ready = calls.find((c) => c.tool_name === "report_ready");
    let done = false;
    for (const c of ready ? [ready] : calls) {
      try {
        if (c.tool_name === "report_ready") {
          log(`${task.name} REPORT_READY:`, JSON.stringify(c.args).slice(0, 300));
          task.ended_at = now();
          await endSession("ready", c);
          task.end = "report_ready";
          done = true;
        } else if (c.tool_name === "ask_user") {
          task.questions += 1;
          const answer = answerFor(c.args);
          log(`${task.name} ASK_USER:`, JSON.stringify(c.args).slice(0, 200), "->", answer.slice(0, 60));
          await call("POST", `/api/agent/${sid}/answer`, { tool_req: c, result: answer });
        } else if (handlers[c.tool_name]) {
          await handlers[c.tool_name](c);
        } else log(`${task.name} unknown tool, ignored:`, c.tool_name);
        handled.add(key(c));
      } catch (e) {
        log(`${task.name} ${c.tool_name} failed:`, e.message);
        await sleep(2000);
      }
    }
    if (done) break;
    if (ch.status && ["completed", "failed", "timed_out", "interrupted"].includes(ch.status)) {
      task.end = ch.status;
      task.notes.push(`H status ${ch.status}${ch.error_code ? ` (${ch.error_code})` : ""}`);
      break;
    }
    if (isDone && await isDone()) { task.end = "done"; break; }
  }
  if (!task.end) {
    task.end = "timeout";
    task.notes.push(`no end within ${TASK_MAX_MS / 1000} s`);
    await endSession();
  }
  task.ended_at ??= now();
  currentSession = null;
  return last;
}

async function paperTask(name, paperId, request, passport, documentId, photoId) {
  const task = newTask(name);
  await waitForSlot();
  await mockReset(name);
  task.started_at = now();
  const started = await call("POST", "/api/papers/start", {
    request, passport, paper_id: paperId, local_session_id: localId, document_id: documentId,
    ...(photoId ? { photo_document_id: photoId } : {}), idempotency_key: randomUUID(),
  });
  currentSession = started.session_id;
  task.continued = started.continued ?? null;
  log(`${name} session`, started.session_id, started.status, started.continued ? "(continued)" : "");
  const run = async (route, c, field) => {
    const r = await call("POST", `/api/agent/${started.session_id}/${route}`, route === "answer" ? { tool_req: c, result: "upload" } : { tool_req: c });
    log(`${name} ${c.tool_name}`, JSON.stringify(c.args), "->", String(r[field]).slice(0, 120));
  };
  await follow(task, started.session_id, started, {
    pick_option: (c) => run("pick", c, "result"),
    fill_field: (c) => run("fill", c, "result"),
    upload_file: (c) => run("answer", c, "upload_result"),
  });
  const result = await mockResult(name);
  if (result) {
    const v = verdict(result, EXPECTED_STEP[name]);
    task.forbidden_clicks = v.forbidden_clicks;
    task.mock = { step_reached: result.step_reached, fields: Object.keys(result.fields), uploads: result.uploads.map((u) => u.field), forbidden_clicks: result.forbidden_clicks };
    task.success = task.end === "report_ready" && v.success;
    if (!v.reached) task.notes.push(`mock step reached: ${result.step_reached ?? "none"}, expected ${EXPECTED_STEP[name]}`);
  } else {
    task.notes.push("mock result unavailable");
    task.success = false;
  }
  return task;
}

async function flightsTask(request) {
  const task = newTask("flights");
  await waitForSlot();
  task.started_at = now();
  const body = { origin: request.origin ?? "Paris", destination: request.destination, departure_date: request.departure_date, return_date: request.return_date, travellers: request.travellers ?? 1, criterion: "cheapest", local_session_id: localId, idempotency_key: randomUUID() };
  const started = await call("POST", "/api/flights/start", body);
  currentSession = started.session_id;
  task.continued = started.continued ?? null;
  log("flights session", started.session_id, started.status, started.continued ? "(continued)" : "");
  let chosen = null;
  await follow(task, started.session_id, started, {
    report_flights: async (c) => {
      const checked = await call("POST", `/api/agent/${started.session_id}/flights`, { tool_req: c });
      log(`flights REPORT_FLIGHTS: ${checked.flights.length} on the page (read by ${checked.source ?? "nobody"})`, checked.retry ? "(retry asked)" : "");
      if (checked.flights.length) {
        chosen = [...checked.flights].sort((a, b) => a.price - b.price)[0];
        task.flights_proposed_at ??= now();
        log("flights CHOICE:", chosen.airline, chosen.price, chosen.currency);
        await call("POST", `/api/agent/${started.session_id}/flights`, { tool_req: c, choice: { flight: chosen } });
      }
    },
    show_return_flight: async (c) => call("POST", `/api/agent/${started.session_id}/flights`, { tool_req: c, return_for: chosen }),
  });
  const google = await tabUrls((u) => /google\.com\/travel\/flights/.test(u));
  task.success = task.end === "report_ready" && google.length > 0 && chosen !== null;
  if (!google.length) task.notes.push("no Google Flights tab at the end");
  return task;
}

async function hotelsTask(request) {
  const task = newTask("hotels");
  await waitForSlot();
  task.started_at = now();
  const started = await call("POST", "/api/hotels/start", { destination: request.destination, checkin: request.departure_date, checkout: request.return_date, criterion: "best", local_session_id: localId, idempotency_key: randomUUID() });
  currentSession = started.session_id;
  task.continued = started.continued ?? null;
  log("hotels session", started.session_id, started.status, started.continued ? "(continued)" : "");
  let chosen = null;
  await follow(task, started.session_id, started, {
    report_hotels: async (c) => {
      const checked = await call("POST", `/api/agent/${started.session_id}/hotels`, { tool_req: c });
      log(`hotels REPORT_HOTELS: ${checked.hotels.length} read`);
      if (checked.hotels.length) {
        chosen = checked.hotels[0];
        await call("POST", `/api/agent/${started.session_id}/hotels`, { tool_req: c, choice: { hotel: chosen } });
      }
    },
  });
  task.success = task.end === "report_ready" && chosen !== null;
  return task;
}

async function voiceCheck() {
  const files = [["fr-bali-mariage.wav", /bali/i, "fr"], ["en-yes.wav", /\byes\b/i, "en"]];
  const results = [];
  for (const [name, expected, lang] of files) {
    const path = resolve("fixtures/audio", name);
    if (!existsSync(path)) { results.push({ name, skipped: "file missing" }); continue; }
    const form = new FormData();
    form.append("audio", new Blob([readFileSync(path)], { type: "audio/wav" }), name);
    const res = await fetch(`${BASE}/api/voice/transcribe`, { method: "POST", body: form });
    const json = await res.json().catch(() => null);
    if (res.status === 503) { results.push({ name, skipped: "GLADIA_API_KEY missing" }); continue; }
    results.push({ name, status: res.status, text: json?.text ?? null, language: json?.language ?? null, success: res.ok && expected.test(json?.text ?? "") && (json?.language ?? lang) === lang });
  }
  const skipped = results.every((r) => r.skipped);
  return { skipped, success: !skipped && results.every((r) => r.skipped || r.success), results };
}

async function oneRun(index) {
  const run = { label, run: index, started_at: now(), ended_at: null, nami: BASE, tasks: [], voice: null, notes: [] };
  const save = () => writeFileSync(join(DIR, `${index}.json`), JSON.stringify(run, null, 2));
  try {
    // 1. The trip, as a sentence.
    const today = new Date().toISOString().slice(0, 10);
    const sentence = "I'm flying from Paris to Bali on Monday for a friend's wedding, two adults, and I come back on December 3.";
    let request;
    try {
      const parsed = await call("POST", "/api/trip/parse", { transcript: sentence, today });
      request = parsed.request;
      log("trip parsed:", JSON.stringify({ destination: request.destination, departure_date: request.departure_date, return_date: request.return_date }));
    } catch (e) {
      run.notes.push(`trip/parse failed: ${e.message}`);
      request = { raw_text: sentence, nationality: "FR", origin_country: "FR", destination: "Bali", country_iso2: "ID", departure_date: null, return_date: null, purpose: "tourism", travellers: 2 };
    }
    const nextMonday = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })();
    request = {
      raw_text: sentence, nationality: request.nationality ?? "FR", origin_country: request.origin_country ?? "FR", origin: request.origin ?? "Paris",
      destination: request.destination ?? "Bali", country_iso2: request.country_iso2 ?? "ID", departure_date: request.departure_date ?? nextMonday,
      arrival_at: request.arrival_at ?? `${request.departure_date ?? nextMonday}T14:30:00+08:00`, return_date: request.return_date ?? "2026-12-03",
      purpose: request.purpose ?? "tourism (a friend's wedding)", travellers: request.travellers ?? 2, status: "planning",
    };
    if (request.return_date <= request.departure_date) request.return_date = new Date(Date.parse(request.departure_date) + 10 * 86_400_000).toISOString().slice(0, 10);

    // 2. The passport: the SPECIMEN of the manifest, read through Nami's real path and checked against it.
    const manifestPath = join(DOCS, "manifest.json");
    if (!existsSync(manifestPath)) throw new Error(`No ${manifestPath}: the synthetic test documents (fixtures/test-documents/README.md) are needed`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const documents = Array.isArray(manifest) ? manifest : manifest.documents ?? [];
    const specimen = documents.find((d) => /bali|e-?voa/i.test(d.case ?? "")) ?? documents[0];
    if (!specimen) throw new Error("manifest.json lists no document");
    const found = await call("GET", "/api/documents/find?kind=passport");
    const doc = found.documents.find((d) => d.name === specimen.passport) ?? found.documents[0];
    if (!doc) throw new Error("No passport found in NAMI_DOCUMENTS_DIR");
    const read = await call("POST", "/api/documents/extract-found", { id: doc.id, consent_provider: "h" });
    const COMPARED = ["surname", "given_names", "passport_number", "birth_date", "expiry_date"];
    const mismatches = COMPARED.filter((k) => read.fields[k] !== specimen.expected[k]);
    run.passport = { document: doc.name, mrz_verified: read.mrz_verified ?? [], mismatches, warnings: read.warnings ?? [] };
    if (mismatches.length) run.notes.push(`passport fields differ from the manifest: ${mismatches.join(", ")}`);
    // The manifest writes ISO alpha-3 nationalities; Nami's contract wants alpha-2 and an issue date.
    const ALPHA2 = { FRA: "FR", TCD: "TD", UTO: "UT" };
    const passport = {
      surname: read.fields.surname ?? specimen.expected.surname,
      given_names: read.fields.given_names ?? specimen.expected.given_names,
      nationality: read.fields.nationality ?? ALPHA2[specimen.expected.nationality] ?? specimen.expected.nationality.slice(0, 2),
      passport_number: read.fields.passport_number ?? specimen.expected.passport_number,
      birth_date: read.fields.birth_date ?? specimen.expected.birth_date,
      issue_date: read.fields.issue_date ?? specimen.expected.issue_date ?? "2022-01-15",
      expiry_date: read.fields.expiry_date ?? specimen.expected.expiry_date,
    };
    const photos = await call("GET", "/api/documents/find?kind=photo").catch(() => ({ documents: [] }));
    const photo = photos.documents.find((d) => d.name === specimen.photo) ?? photos.documents[0];
    log("passport read:", doc.name, "mismatches:", mismatches.join(",") || "none", "photo:", photo?.name ?? "none");

    // 3. The four tasks, each "yes" right after the previous task.
    run.tasks.push(await paperTask("visa", "evoa", request, passport, doc.id, photo?.id)); save();
    run.tasks.push(await paperTask("arrival_card", "arrival_card", request, passport, doc.id, photo?.id)); save();
    run.tasks.push(await flightsTask(request)); save();
    run.tasks.push(await hotelsTask(request)); save();
    // 4. The voice check.
    run.voice = await voiceCheck();
  } catch (e) {
    run.notes.push(`aborted: ${e.message}`);
    log("RUN ABORTED:", e.message);
    await endSession();
  }
  run.ended_at = now();
  save();
  log(`run ${index}: ${run.tasks.filter((t) => t.success).length}/${run.tasks.length} tasks ok`, run.notes.length ? `notes: ${run.notes.join("; ")}` : "");
  return run;
}

for (let i = 1; i <= runs; i += 1) {
  await oneRun(i);
  if (i < runs) await sleep(5000);
}
const table = summaryTable(label, loadRuns(DIR));
writeFileSync(join(DIR, "summary.md"), `${table}\n`);
console.log(`\n${table}\n`);
