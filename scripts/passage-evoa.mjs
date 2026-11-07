// Drives one real e-VOA pass through Nami's routes, exactly as the side panel does, for the test bench
// of docs/tests/f1-evoa.md. Passport data stays in memory; the log only shows what the agent says.
//
// Prerequisites: `npm run demo` running (Nami on :3000, agent Chrome on :9333, `holo local browser`),
// the passport scan and the ID photo in NAMI_DOCUMENTS_DIR, the official tab on the visa selection page.
//
// Usage: node scripts/passage-evoa.mjs <label> [stopAfterSteps]
//   label           name of the log files written in NAMI_RUNS_DIR (default ~/nami-runs)
//   stopAfterSteps  cancel the session after that many agent steps (the "Stop agent" pass of the ticket)
// Env (optional): NAMI_URL (http://localhost:3000), NAMI_AGENT_CHROME_PORT (9333), NAMI_RUNS_DIR,
//   NAMI_DEMO_EMAIL, NAMI_DEMO_PHONE, NAMI_DEMO_ADDRESS (answers to ask_user; nothing is ever submitted).
//
// Safety: the session is cancelled as soon as the agent calls report_ready, as soon as the official tab's
// URL contains payment / checkout / bayar / pembayaran, and after stopAfterSteps. Never answers in place of
// the user for anything else: an unanswered ask_user waits for <label>-answer-N.txt in NAMI_RUNS_DIR.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const BASE = process.env.NAMI_URL ?? "http://localhost:3000";
const CDP = `http://127.0.0.1:${process.env.NAMI_AGENT_CHROME_PORT ?? "9333"}`;
const DIR = process.env.NAMI_RUNS_DIR ?? `${homedir()}/nami-runs`;
const label = process.argv[2] ?? "run";
const stopAfter = Number(process.argv[3] ?? 0);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(DIR, { recursive: true });

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error ?? ""}`);
  return json;
}

// 1. Passport: the flat scan first (the site's MRZ reader rejects hand-held phone photos).
const found = await call("GET", "/api/documents/find?kind=passport");
const doc = found.documents.find((d) => /scan/i.test(d.name)) ?? found.documents.find((d) => /passe?port/i.test(d.name)) ?? found.documents[0];
if (!doc) { log("ABORT: no passport in NAMI_DOCUMENTS_DIR"); process.exit(2); }
log("passport document:", doc.name);
let fields = null;
for (let i = 0; i < 3 && !fields; i++) {
  try {
    const ex = await call("POST", "/api/documents/extract-found", { id: doc.id, consent_provider: "h" });
    const missing = Object.entries(ex.fields).filter(([, v]) => v === null).map(([k]) => k);
    log("passport read, missing:", missing.join(",") || "none", "mrz_verified:", (ex.mrz_verified ?? []).join(","));
    if (missing.length === 0) fields = ex.fields;
  } catch (e) { log("read failed:", e.message); await sleep(3000); }
}
if (!fields) { log("ABORT: passport not read (H busy? retry in a minute)"); process.exit(2); }

// 2. Photo: handed to the session so that upload_file { purpose: "photo" } works without help.
let photoId;
try {
  const photos = await call("GET", "/api/documents/find?kind=photo");
  const photo = photos.documents.find((d) => /^photo\./i.test(d.name)) ?? photos.documents[0];
  if (photo) { photoId = photo.id; log("photo document:", photo.name); }
} catch (e) { log("photo find failed:", e.message); }

const request = {
  raw_text: "I'm flying to Bali on Monday for a friend's wedding, landing at 2:30 pm.",
  nationality: fields.nationality ?? "FR", origin_country: "FR", destination: "Bali", country_iso2: "ID",
  departure_date: "2026-11-09", arrival_at: "2026-11-10T14:30:00+08:00", return_date: null,
  purpose: "tourism (a friend's wedding)", travellers: 1, status: "planning",
};
const localId = readFileSync(`${homedir()}/.config/nami/local-browser-session-id`, "utf8").trim();
const started = await call("POST", "/api/papers/start", {
  request, passport: fields, paper_id: "evoa", local_session_id: localId, document_id: doc.id,
  ...(photoId ? { photo_document_id: photoId } : {}), idempotency_key: randomUUID(),
});
const sid = started.session_id;
log("session", sid, started.status);
writeFileSync(`${DIR}/${label}.session`, sid);

// 3. Follow the session like the panel: pick_option, fill_field and upload_file are executed by Nami's routes,
// ask_user is answered from the env when it is one of the known demo questions, else waits for a file.
const AUTO = [
  [/e-?mail/i, process.env.NAMI_DEMO_EMAIL],
  [/phone|telephone|mobile/i, process.env.NAMI_DEMO_PHONE && `Use ${process.env.NAMI_DEMO_PHONE} (demo number; nothing will be submitted).`],
  [/address|residence|hotel|accommodation|stay/i, process.env.NAMI_DEMO_ADDRESS],
  [/return ticket|return flight/i, "There is no return ticket yet; leave that upload empty and continue; never upload any other file there."],
  [/port of entry|airport|denpasar/i, "Bali's airport is listed as NGURAH RAI AIRPORT. Call pick_option with field Port of Entry and option NGURAH RAI AIRPORT, then continue."],
  [/passport_country|prancis/i, "PRANCIS is the Indonesian name of FRANCE: it is correct. Leave it unchanged and continue."],
].filter(([, answer]) => answer);
async function tabUrl() {
  try {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    return list.filter((t) => t.type === "page" && t.url.includes("imigrasi")).map((t) => t.url).join(" ");
  } catch { return ""; }
}
const handled = new Set();
const key = (c) => c.id ?? `${c.tool_name}:${JSON.stringify(c.args)}`;
const run = async (route, c, field) => {
  const r = await call("POST", `/api/agent/${sid}/${route}`, route === "answer" ? { tool_req: c, result: "upload" } : { tool_req: c });
  log(c.tool_name, JSON.stringify(c.args), "->", r[field]);
};
let next = 0, steps = 0, asks = 0, done = false, last = null;
while (!done) {
  let ch;
  try { ch = await call("GET", `/api/agent/${sid}/changes?from_index=${next}`); }
  catch (e) { log("poll error:", e.message); await sleep(2000); continue; }
  last = ch;
  next = ch.next_index;
  for (const s of ch.steps) { steps++; log(`step ${steps}:`, s); }
  if (ch.left_official_site) log("LEFT OFFICIAL SITE:", ch.left_official_site);
  const url = await tabUrl();
  if (/payment|checkout|bayar|pembayaran/i.test(url)) {
    log("WATCHDOG: payment URL reached, cancelling");
    await call("POST", `/api/agent/${sid}/cancel`);
    break;
  }
  if (stopAfter && steps >= stopAfter) {
    log("STOP requested after", steps, "steps");
    await call("POST", `/api/agent/${sid}/cancel`);
    break;
  }
  const calls = ch.pending_tool_calls.filter((c) => !handled.has(key(c)));
  const ready = calls.find((c) => c.tool_name === "report_ready");
  for (const c of ready ? [ready] : calls) {
    try {
      if (c.tool_name === "report_ready") {
        log("REPORT_READY:", JSON.stringify(c.args).slice(0, 400));
        await call("POST", `/api/agent/${sid}/cancel`);
        log("cancelled after report_ready");
        done = true;
      } else if (c.tool_name === "pick_option") await run("pick", c, "result");
      else if (c.tool_name === "fill_field") await run("fill", c, "result");
      else if (c.tool_name === "upload_file") await run("answer", c, "upload_result");
      else if (c.tool_name === "ask_user") {
        asks++;
        const answerFile = `${DIR}/${label}-answer-${asks}.txt`;
        writeFileSync(`${DIR}/${label}-ask-${asks}.txt`, JSON.stringify(c.args));
        log("ASK_USER", asks, JSON.stringify(c.args), "-> answer in", answerFile);
        const auto = AUTO.find(([re]) => re.test(`${c.args.field ?? ""} ${c.args.question ?? ""}`));
        if (auto) writeFileSync(answerFile, auto[1]);
        while (!existsSync(answerFile)) await sleep(1000);
        await call("POST", `/api/agent/${sid}/answer`, { tool_req: c, result: readFileSync(answerFile, "utf8").trim() });
        log("answered ask", asks);
      } else log("unknown tool, ignored:", c.tool_name);
      handled.add(key(c));
    } catch (e) { log(`${c.tool_name} failed:`, e.message); await sleep(2000); }
  }
  if (ch.status && ["completed", "failed", "timed_out", "interrupted"].includes(ch.status)) break;
}
await sleep(3000);
try { last = await call("GET", `/api/agent/${sid}/changes?from_index=${next}`); } catch {}
log("END status:", last?.status, "outcome:", last?.outcome, "error:", last?.error_code, "metrics:", JSON.stringify(last?.metrics));
log("duration_s:", Math.round((Date.now() - t0) / 1000), "steps:", steps);
