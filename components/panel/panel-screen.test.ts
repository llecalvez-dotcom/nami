import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentLine, WATCH_MESSAGE } from "@/components/panel/panel-screen";
import type { Trip } from "@/lib/trip-state";

const RUN = {
  session_id: "s-1",
  kind: "paper" as const,
  started_at: "2026-11-07T19:00:00.000Z",
  next_index: 3,
  handled_tool_ids: [],
  drained: false,
};

function trip(state: NonNullable<Trip["agent_run"]>["state"], steps: string[]): Trip {
  return {
    id: "t-1",
    created_at: "2026-11-07T19:00:00.000Z",
    sample: false,
    request: {} as Trip["request"],
    conversation: [],
    modules: [],
    formalities: [],
    agent_run: { ...RUN, state },
    agent_steps: steps,
  };
}

const line = (t: Trip) => renderToStaticMarkup(createElement(AgentLine, { trip: t, onStop: () => {} }));

describe("panel agent line", () => {
  it("shows the last step only, with Stop while the agent runs", () => {
    const html = line(trip("running", ["Session created on your local Chrome", "Choosing FRANCE"]));
    expect(html).toContain("Choosing FRANCE");
    expect(html).not.toContain("Session created");
    expect(html).toContain("Stop");
  });

  it("drops Stop once the agent is done", () => {
    const html = line(trip("interrupted", ["Nami stopped the agent at the payment page so you can check and pay"]));
    expect(html).toContain("payment page");
    expect(html).not.toContain("Stop</button>");
  });

  it("renders nothing before the agent starts", () => {
    expect(line({ ...trip("running", []), agent_run: null })).toBe("");
  });

  it("tells the traveller where to look, and that Nami never pays", () => {
    expect(WATCH_MESSAGE).toMatch(/tab on the left/);
    expect(WATCH_MESSAGE).toMatch(/never click Pay/);
    expect(WATCH_MESSAGE).not.toMatch(/[–—]/);
  });
});
