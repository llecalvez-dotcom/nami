import { describe, expect, it } from "vitest";
import { runFigures, summaryTable } from "./report.mjs";

const at = (seconds: number) => new Date(1_700_000_000_000 + seconds * 1000).toISOString();
const run = {
  label: "baseline",
  run: 1,
  started_at: at(0),
  ended_at: at(400),
  voice: { success: true },
  tasks: [
    { name: "visa", started_at: at(10), first_step_at: at(25), ended_at: at(80), success: true, h_steps: 30, h_cost: 0.08, questions: 1, recoveries: 0, forbidden_clicks: 0 },
    { name: "arrival_card", started_at: at(81), first_step_at: at(130), ended_at: at(200), success: true, h_steps: 20, h_cost: 0.05, questions: 2, recoveries: 1, forbidden_clicks: 0 },
    { name: "flights", started_at: at(201), first_step_at: at(240), ended_at: at(330), success: false, h_steps: 15, h_cost: 0.04, questions: 0, recoveries: 0, forbidden_clicks: 0 },
  ],
};

describe("the benchmark report (ticket 0)", () => {
  it("measures each task, the dead time between tasks, the totals and the recoveries", () => {
    const f = runFigures(run);
    expect(f.success).toBe("2/3");
    expect(f.all_ok).toBe(false);
    expect(f.task_times.visa).toBe(70_000);
    expect(f.task_times.hotels).toBeNull();
    // 80 -> 130: 50 s, 200 -> 240: 40 s
    expect(f.dead_max).toBe(50_000);
    expect(f.dead_avg).toBe(45_000);
    expect(f.total).toBe(400_000);
    expect(f.h_steps).toBe(65);
    expect(f.h_cost).toBeCloseTo(0.17);
    expect(f.questions).toBe(3);
    expect(f.recoveries).toBe(1);
    expect(f.voice).toBe("ok");
  });

  it("prints one Markdown row per run, the baseline rows after", () => {
    const table = summaryTable("v2", [run], [{ ...run, run: 1, tasks: run.tasks.map((t) => ({ ...t, success: true })) }]);
    const lines = table.split("\n");
    expect(lines[0]).toContain("| Run | Success | Visa |");
    expect(lines[2]).toMatch(/^\| v2 1 \| 2\/3 \(fail\) \| 70 s \| 119 s \| 129 s \|  \| 50 s \/ 45 s \| 400 s \| 65 \| \$0\.17 \| 3 \| 1 \| 0 \| ok \|$/);
    expect(lines[3]).toMatch(/^\| baseline 1 \| 3\/3 \|/);
  });
});
