// Drives one real flight search through Nami's routes, exactly as the side panel does, for the test bench of
// docs/tests/g1-vols.md. No passport, no name, no e-mail: the session only knows the cities, the dates and the criterion.
//
// Prerequisites: `npm run demo` running (Nami on :3000, agent Chrome on :9333, `holo local browser`).
//
// Usage: node scripts/passage-vol.mjs <label> [criterion] [choice] [stopAfterSteps]
//   label           name of the log files written in NAMI_RUNS_DIR (default ~/nami-runs)
//   criterion       cheapest | fastest | fewest_stops | best (default cheapest)
//   choice          which of the proposed flights to open, 1 to 3 (default 1)
//   stopAfterSteps  cancel the session after that many agent steps
// Env (optional): NAMI_URL (http://localhost:3000), NAMI_AGENT_CHROME_PORT (9333), NAMI_RUNS_DIR,
//   NAMI_FLIGHT_DESTINATION (Bali), NAMI_FLIGHT_DEPART (2026-11-23), NAMI_FLIGHT_RETURN (2026-12-03), NAMI_FLIGHT_TRAVELLERS (1).
//
// Safety: the session is cancelled as soon as the agent calls report_ready, as soon as the Google tab leaves
// www.google.com or reaches a booking / checkout / payment URL, and after stopAfterSteps. An ask_user waits for
// <label>-answer-N.txt in NAMI_RUNS_DIR: nothing is ever answered in place of the user.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const BASE = process.env.NAMI_URL ?? "http://localhost:3000";
const CDP = `http://127.0.0.1:${process.env.NAMI_AGENT_CHROME_PORT ?? "9333"}`;
const DIR = process.env.NAMI_RUNS_DIR ?? `${homedir()}/nami-runs`;
const label = process.argv[2] ?? "vol";
const criterion = process.argv[3] ?? "cheapest";
const choice = Number(process.argv[4] ?? 1);
const stopAfter = Number(process.argv[5] ?? 0);
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

// Same ranking as the panel (lib/flights/rank.ts), kept short here: the script only needs to pick a line.
function rank(flights) {
  const sorted = [...flights];
  const norm = (key) => {
    const values = flights.map((f) => f[key]);
    const min = Math.min(...values), max = Math.max(...values);
    return (v) => (max === min ? 0 : (v - min) / (max - min));
  };
  if (criterion === "fastest") sorted.sort((a, b) => a.duration_min - b.duration_min || a.price - b.price);
  else if (criterion === "fewest_stops") sorted.sort((a, b) => a.stops - b.stops || a.price - b.price);
  else if (criterion === "best") {
    const p = norm("price"), d = norm("duration_min"), s = norm("stops");
    const score = (f) => 0.5 * p(f.price) + 0.3 * d(f.duration_min) + 0.2 * s(f.stops);
    sorted.sort((a, b) => score(a) - score(b) || a.price - b.price);
  } else sorted.sort((a, b) => a.price - b.price || a.duration_min - b.duration_min);
  return sorted.slice(0, 3);
}

// 1. Start: the request only.
const localId = readFileSync(`${homedir()}/.config/nami/local-browser-session-id`, "utf8").trim();
const started = await call("POST", "/api/flights/start", {
  origin: process.env.NAMI_FLIGHT_ORIGIN ?? "Paris",
  destination: process.env.NAMI_FLIGHT_DESTINATION ?? "Bali",
  departure_date: process.env.NAMI_FLIGHT_DEPART ?? "2026-11-23",
  return_date: process.env.NAMI_FLIGHT_RETURN ?? "2026-12-03",
  travellers: Number(process.env.NAMI_FLIGHT_TRAVELLERS ?? 1),
  criterion,
  local_session_id: localId,
  idempotency_key: randomUUID(),
});
const sid = started.session_id;
log("session", sid, started.status, "criterion", criterion, "choice", choice);
writeFileSync(`${DIR}/${label}.session`, sid);

async function tabUrl() {
  try {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    return list.filter((t) => t.type === "page" && /google\.com\/travel/.test(t.url)).map((t) => t.url).join(" ");
  } catch { return ""; }
}
const handled = new Set();
const key = (c) => c.id ?? `${c.tool_name}:${JSON.stringify(c.args)}`;
let next = 0, steps = 0, asks = 0, done = false, last = null, chosen = null;
// Timings for docs/tests/g1-vols.md: seconds from the start to the flights proposed, and to the booking options page.
const timing = { flights_proposed_s: null, booking_page_s: null, source: null };
const since = () => Math.round((Date.now() - t0) / 1000);
while (!done) {
  let ch;
  try { ch = await call("GET", `/api/agent/${sid}/changes?from_index=${next}`); }
  catch (e) { log("poll error:", e.message); await sleep(2000); continue; }
  last = ch;
  next = ch.next_index;
  for (const s of ch.steps) { steps++; log(`step ${steps}:`, s); }
  if (ch.left_official_site) log("LEFT GOOGLE:", ch.left_official_site);
  const url = await tabUrl();
  if (/booking\/|checkout|payment|paiement/i.test(url)) {
    log("WATCHDOG: booking URL reached, cancelling", url);
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
        timing.booking_page_s ??= since();
        log("REPORT_READY:", JSON.stringify(c.args).slice(0, 400), "url:", url);
        await call("POST", `/api/agent/${sid}/cancel`);
        log("cancelled after report_ready");
        done = true;
      } else if (c.tool_name === "report_flights") {
        const reported = Array.isArray(c.args.flights) ? c.args.flights.length : 0;
        const checked = await call("POST", `/api/agent/${sid}/flights`, { tool_req: c });
        log(`REPORT_FLIGHTS: ${reported} reported, ${checked.flights.length} on the page (read by ${checked.source ?? "nobody"}), dropped ${checked.dropped ?? 0}, invalid ${checked.invalid ?? 0}`,
          checked.retry ? (checked.loading ? "(still loading, wait asked)" : "(reread asked)") : checked.unreadable ? "(page unreadable)" : "");
        writeFileSync(`${DIR}/${label}-flights-${steps}.json`, JSON.stringify({ reported: c.args.flights, checked: checked.flights }, null, 2));
        if (checked.flights.length) {
          if (timing.flights_proposed_s === null) { timing.flights_proposed_s = since(); timing.source = checked.source ?? null; }
          const ranked = rank(checked.flights);
          ranked.forEach((f, i) => log(`  ${i + 1}. ${f.airline}, ${f.price} ${f.currency}, ${f.stops} stop(s), ${f.duration_min} min, #${f.index}`));
          chosen = ranked[Math.min(choice, ranked.length) - 1];
          log("CHOICE:", chosen.airline, chosen.price, "#", chosen.index);
          await call("POST", `/api/agent/${sid}/flights`, { tool_req: c, choice: { flight: chosen } });
        }
      } else if (c.tool_name === "ask_user") {
        asks++;
        const answerFile = `${DIR}/${label}-answer-${asks}.txt`;
        writeFileSync(`${DIR}/${label}-ask-${asks}.txt`, JSON.stringify(c.args));
        log("ASK_USER", asks, JSON.stringify(c.args), "-> answer in", answerFile);
        while (!existsSync(answerFile)) await sleep(1000);
        await call("POST", `/api/agent/${sid}/answer`, { tool_req: c, result: readFileSync(answerFile, "utf8").trim() });
        log("answered ask", asks);
      } else if (c.tool_name === "show_return_flight") {
        log("SHOW_RETURN_FLIGHT");
        await call("POST", `/api/agent/${sid}/flights`, { tool_req: c, return_for: chosen });
      } else log("unknown tool, ignored:", c.tool_name);
      handled.add(key(c));
    } catch (e) { log(`${c.tool_name} failed:`, e.message); await sleep(2000); }
  }
  if (ch.status && ["completed", "failed", "timed_out", "interrupted"].includes(ch.status)) break;
}
await sleep(3000);
try { last = await call("GET", `/api/agent/${sid}/changes?from_index=${next}`); } catch {}
log("END status:", last?.status, "outcome:", last?.outcome, "error:", last?.error_code, "metrics:", JSON.stringify(last?.metrics));
log("chosen:", chosen ? `${chosen.airline} ${chosen.price} ${chosen.currency}` : "none", "duration_s:", since(), "steps:", steps);
log("TIMING:", JSON.stringify({ ...timing, total_s: since(), steps }), "(target: flights proposed in under 60 s)");
writeFileSync(`${DIR}/${label}-timing.json`, JSON.stringify({ ...timing, total_s: since(), steps, criterion, choice }, null, 2));
