// Drives one real hotel search through Nami's routes, as the side panel does. No passport, no name: the session only
// knows the destination and the dates. Prerequisite: `npm run demo` running.
//
// Usage: node scripts/passage-hotel.mjs <label> [choice] [criterion]
//   choice     which of the hotels read to open, 1 to 3 (default 1)
//   criterion  cheapest | best_rated | best (default best)
// Env (optional): NAMI_URL, NAMI_AGENT_CHROME_PORT, NAMI_RUNS_DIR, NAMI_HOTEL_DESTINATION, NAMI_HOTEL_CHECKIN, NAMI_HOTEL_CHECKOUT.
//
// Safety: the session is cancelled at report_ready, and as soon as no tab is left on google.com/travel while one was.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const BASE = process.env.NAMI_URL ?? "http://localhost:3000";
const DIR = process.env.NAMI_RUNS_DIR ?? `${homedir()}/nami-runs`;
const label = process.argv[2] ?? "hotel";
const choice = Number(process.argv[3] ?? 1);
const criterion = process.argv[4] ?? "best";
const t0 = Date.now();
const since = () => Math.round((Date.now() - t0) / 1000);
const log = (...a) => console.log(`[${since()}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(DIR, { recursive: true });

async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error ?? ""}`);
  return json;
}

const started = await call("POST", "/api/hotels/start", {
  destination: process.env.NAMI_HOTEL_DESTINATION ?? "Bali",
  checkin: process.env.NAMI_HOTEL_CHECKIN ?? "2026-11-23",
  checkout: process.env.NAMI_HOTEL_CHECKOUT ?? "2026-12-03",
  criterion,
  local_session_id: readFileSync(`${homedir()}/.config/nami/local-browser-session-id`, "utf8").trim(),
  idempotency_key: randomUUID(),
});
const sid = started.session_id;
log("session", sid, started.status);
writeFileSync(`${DIR}/${label}.session`, sid);

const handled = new Set();
const key = (c) => c.id ?? `${c.tool_name}:${JSON.stringify(c.args)}`;
const timing = { hotels_proposed_s: null, prices_page_s: null };
let next = 0, steps = 0, done = false, last = null;
while (!done) {
  let ch;
  try { ch = await call("GET", `/api/agent/${sid}/changes?from_index=${next}`); }
  catch (e) { log("poll error:", e.message); await sleep(2000); continue; }
  last = ch;
  next = ch.next_index;
  for (const s of ch.steps) { steps++; log(`step ${steps}:`, s); }
  if (ch.left_official_site) log("LEFT GOOGLE:", ch.left_official_site);
  const calls = ch.pending_tool_calls.filter((c) => !handled.has(key(c)));
  const ready = calls.find((c) => c.tool_name === "report_ready");
  for (const c of ready ? [ready] : calls) {
    try {
      if (c.tool_name === "report_ready") {
        timing.prices_page_s ??= since();
        log("REPORT_READY:", JSON.stringify(c.args).slice(0, 300));
        await call("POST", `/api/agent/${sid}/cancel`);
        done = true;
      } else if (c.tool_name === "report_hotels") {
        const checked = await call("POST", `/api/agent/${sid}/hotels`, { tool_req: c });
        log(`REPORT_HOTELS: ${checked.hotels.length} read`, checked.retry ? "(reread asked)" : checked.unreadable ? "(page unreadable)" : "");
        if (checked.hotels.length) {
          timing.hotels_proposed_s ??= since();
          checked.hotels.slice(0, 5).forEach((h) => log(`  ${h.index}. ${h.name}, ${h.price} ${h.currency}/night, ${h.rating}/5 (${h.reviews}), ${h.stars ?? "?"}*`));
          const hotel = checked.hotels[Math.min(choice, checked.hotels.length) - 1];
          log("CHOICE:", hotel.name);
          await call("POST", `/api/agent/${sid}/hotels`, { tool_req: c, choice: { hotel } });
        }
      } else if (c.tool_name === "ask_user") {
        log("ASK_USER:", JSON.stringify(c.args).slice(0, 300), "-> cancelling");
        await call("POST", `/api/agent/${sid}/cancel`);
        done = true;
      } else log("unknown tool, ignored:", c.tool_name);
      handled.add(key(c));
    } catch (e) { log(`${c.tool_name} failed:`, e.message); await sleep(2000); }
  }
  if (ch.status && ["completed", "failed", "timed_out", "interrupted"].includes(ch.status)) break;
}
await sleep(2000);
log("END status:", last?.status, "error:", last?.error_code, "metrics:", JSON.stringify(last?.metrics));
log("TIMING:", JSON.stringify({ ...timing, total_s: since(), steps }));
