// Ticket 0: the benchmark table from bench/<label>/*.json (written by scripts/bench/run.mjs).
// Usage: node scripts/bench/report.mjs <label> [baselineLabel]   -> prints Markdown, writes bench/<label>/summary.md
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TASKS = ["visa", "arrival_card", "flights", "hotels"];
const s = (ms) => (ms === null || ms === undefined || Number.isNaN(ms) ? "" : `${Math.round(ms / 1000)} s`);
const money = (value) => (value === null || value === undefined ? "" : `$${Number(value).toFixed(2)}`);

export function loadRuns(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

// One run's figures, from its tasks. Dead time: end of a task to the first step of the next.
export function runFigures(run) {
  const tasks = run.tasks ?? [];
  const byName = Object.fromEntries(tasks.map((t) => [t.name, t]));
  const done = tasks.filter((t) => t.success).length;
  const deadTimes = [];
  for (let i = 1; i < tasks.length; i += 1) {
    const prev = tasks[i - 1], next = tasks[i];
    if (prev.ended_at && next.first_step_at) deadTimes.push(Date.parse(next.first_step_at) - Date.parse(prev.ended_at));
  }
  const sum = (key) => tasks.reduce((total, t) => total + (Number(t[key]) || 0), 0);
  const cost = tasks.some((t) => t.h_cost !== null && t.h_cost !== undefined) ? sum("h_cost") : null;
  return {
    run: run.run,
    success: `${done}/${tasks.length}`,
    all_ok: tasks.length > 0 && done === tasks.length,
    task_times: Object.fromEntries(TASKS.map((name) => [name, byName[name] ? (byName[name].ended_at && byName[name].started_at ? Date.parse(byName[name].ended_at) - Date.parse(byName[name].started_at) : null) : null])),
    dead_max: deadTimes.length ? Math.max(...deadTimes) : null,
    dead_avg: deadTimes.length ? deadTimes.reduce((a, b) => a + b, 0) / deadTimes.length : null,
    total: run.started_at && run.ended_at ? Date.parse(run.ended_at) - Date.parse(run.started_at) : null,
    h_steps: sum("h_steps"),
    h_cost: cost,
    questions: sum("questions"),
    recoveries: sum("recoveries"),
    forbidden_clicks: sum("forbidden_clicks"),
    voice: run.voice ? (run.voice.skipped ? "skipped" : run.voice.success ? "ok" : "failed") : "",
  };
}

export function summaryTable(label, runs, baselineRuns = []) {
  const header = "| Run | Success | Visa | Arrival card | Flights | Hotels | Dead time (max / avg) | Total | H steps | H cost | Questions | Recoveries | Forbidden clicks | Voice |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const row = (tag, f) => `| ${tag} | ${f.success}${f.all_ok ? "" : " (fail)"} | ${s(f.task_times.visa)} | ${s(f.task_times.arrival_card)} | ${s(f.task_times.flights)} | ${s(f.task_times.hotels)} | ${s(f.dead_max)} / ${s(f.dead_avg)} | ${s(f.total)} | ${f.h_steps} | ${money(f.h_cost)} | ${f.questions} | ${f.recoveries} | ${f.forbidden_clicks} | ${f.voice} |`;
  const lines = [header, sep, ...runs.map((run) => row(`${label} ${run.run}`, runFigures(run)))];
  for (const run of baselineRuns) lines.push(row(`baseline ${run.run}`, runFigures(run)));
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const label = process.argv[2];
  if (!label) {
    console.error("Usage: node scripts/bench/report.mjs <label> [baselineLabel]");
    process.exit(2);
  }
  const dir = join(process.env.NAMI_BENCH_DIR ?? "bench", label);
  const runs = loadRuns(dir);
  const baseline = process.argv[3] ? loadRuns(join(process.env.NAMI_BENCH_DIR ?? "bench", process.argv[3])) : [];
  const table = summaryTable(label, runs, baseline);
  if (existsSync(dir)) writeFileSync(join(dir, "summary.md"), `${table}\n`);
  console.log(table);
}
