import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FocusStage, TypeInstead, type AgentView } from "@/components/panel/focus-stage";
import { AnswerModeToggle, ANSWER_MODE_TEXTS } from "@/components/voice/answer-mode-toggle";
import { agentSpeech, PANEL_TEXTS, StatusLine, WATCH_MESSAGE } from "@/components/panel/panel-screen";
import { agentChecklist, REOPENED_TEXTS } from "@/lib/panel-focus";
import type { ConversationItem } from "@/lib/trip-state";

const noop = () => {};
const stage = (props: Partial<Parameters<typeof FocusStage>[0]>) =>
  renderToStaticMarkup(
    createElement(FocusStage, {
      item: null,
      scene: "matin",
      visual: null,
      ready: null,
      agent: null,
      busy: null,
      t: (text: string) => text,
      onAnswer: noop,
      onAnswerAgent: noop,
      onAnswerText: async () => {},
      onDecide: noop,
      onStop: noop,
      ...props,
    }),
  );

const visa: ConversationItem = {
  id: "p",
  kind: "proposal",
  action: "create_visa",
  text: "For Bali you need an e-VOA. Shall I fill it in for you?",
  accept_label: "Create my visa",
  decline_label: "Not now",
  decision: null,
};

describe("the side panel shows one thing at a time", () => {
  it("shows Nami's sentence as a title on the wall, and the two answers", () => {
    const html = stage({ item: visa });
    expect(html).toMatch(/For Bali you need an e.VOA\./);
    expect(html).toContain("Create my visa");
    expect(html).toContain("Not now");
  });

  it("shows the agent's steps and Stop while it works, with no answer to give", () => {
    const agent: AgentView = { paper: "visa", checklist: agentChecklist("visa", ["Selected FRANCE"], false), step: "Choosing the purpose" };
    const html = stage({ item: { id: "w", kind: "agent", text: WATCH_MESSAGE }, agent });
    expect(html).toContain("filling in your visa");
    expect(html).toContain("Choosing the purpose");
    expect(html).toContain("Stop");
    expect(html).not.toContain("Create my visa");
  });

  it("puts the number of checked fields on the blurred passport, never the number itself", () => {
    const html = stage({ item: { ...visa, action: "confirm_passport" }, visual: { kind: "passport_read", id: "doc-1", holder: "Leon LE CALVEZ", verified: 6 } });
    expect(html).toContain("6 fields checked");
    expect(html).toContain("Leon LE CALVEZ");
    expect(html).toContain("blur-");
  });

  it("celebrates the paper made ready before the next proposal", () => {
    const html = stage({ item: { ...visa, action: "create_arrival_card", text: "Next, your arrival card?" }, ready: "visa" });
    expect(html).toContain("Your visa is ready.");
    expect(html).toContain("Next, your arrival card?");
  });

  it("has no dash in its fixed texts", () => {
    expect(PANEL_TEXTS.join(" ")).not.toMatch(/[–—]/);
    // The status line and the marks are translated like the rest.
    for (const text of ["Filling the form", "Waiting for you", "Done", "running", "to do", "Open the tab", ...Object.values(REOPENED_TEXTS)]) expect(PANEL_TEXTS).toContain(text);
    expect(WATCH_MESSAGE).toMatch(/tab on the left/);
    expect(WATCH_MESSAGE).toMatch(/never click Pay/);
  });
});

describe("voice, typing or a tap at every step (ticket 20)", () => {
  const purpose: ConversationItem = {
    id: "q",
    kind: "question",
    from: "nami",
    field: "purpose",
    question: "Why are you going?",
    options: [
      { value: "tourism", label: "Tourism" },
      { value: "business", label: "Business" },
    ],
    input: null,
    answer: null,
  };

  it("offers the text field on a question that has no text input, next to its buttons and the microphone", () => {
    const html = stage({ item: purpose });
    expect(html).toContain("Type instead");
    expect(html).toContain("Tourism");
    expect(html).toContain("Business");
    expect(html).toContain('aria-label="Speak"');
  });

  it("offers yes, no, the microphone and the text field on a proposal", () => {
    const html = stage({ item: visa });
    expect(html).toContain("Create my visa");
    expect(html).toContain("Not now");
    expect(html).toContain('aria-label="Speak"');
    expect(html).toContain("Type instead");
  });

  it("shows the field closed in Voice mode and open and focused in Typing mode", () => {
    const t = (text: string) => text;
    const closed = renderToStaticMarkup(createElement(TypeInstead, { t, onSubmit: noop }));
    expect(closed).toContain("Type instead");
    expect(closed).not.toContain("<input");
    const open = renderToStaticMarkup(createElement(TypeInstead, { t, onSubmit: noop, defaultOpen: true }));
    expect(open).toContain("<input");
    expect(open).toMatch(/<input[^>]*autofocus/i);
  });

  it("has a Voice / Typing switch, separate from mute, with translated texts", () => {
    const html = renderToStaticMarkup(createElement(AnswerModeToggle, { t: (text: string) => text }));
    expect(html).toContain('aria-label="Switch to typing"');
    expect(html).toContain('data-answer-mode="voice"');
    expect(html).not.toContain("Mute");
    for (const text of ANSWER_MODE_TEXTS) expect(PANEL_TEXTS).toContain(text);
    expect(ANSWER_MODE_TEXTS.join(" ")).not.toMatch(/[–—]/);
  });
});

describe("the status line under the marks", () => {
  const line = (props: Partial<Parameters<typeof StatusLine>[0]>) =>
    renderToStaticMarkup(createElement(StatusLine, { status: null, reopened: null, paper: "visa", pulsing: false, t: (text: string) => text, ...props }));

  it("shows what the agent is doing, with its progress", () => {
    expect(line({ status: { text: "Filling the form", progress: "4/~20" }, pulsing: true })).toContain("Filling the form (4/~20)");
    expect(line({})).toBe("");
  });

  it("says that a paper's tab was closed and the site reopened, even with no session, in the paper's color", () => {
    const html = line({ reopened: "visa" });
    expect(html).toContain("The visa tab was closed, I reopened the site");
    expect(html).toContain('role="status"');
    expect(line({ status: { text: "Filling the form", progress: "4/~20" }, reopened: "arrival_card", pulsing: true })).toContain("The arrival card tab was closed, I reopened the site");
    expect(line({ status: { text: "Filling the form" }, reopened: "arrival_card", pulsing: true })).not.toContain("animate-pulse");
    expect(line({ reopened: "flights" })).toContain("The Google Flights tab was closed, I reopened it");
    for (const text of Object.values(REOPENED_TEXTS)) expect(text).not.toMatch(/[–—]/);
  });
});

describe("what Nami says aloud about the agent", () => {
  it("reads the first sentence of a step", () => {
    expect(agentSpeech("FRANCE is selected. Now I need to select the purpose.")).toBe("FRANCE is selected.");
  });

  it.each(["Action: scroll_web", "On evisa.imigrasi.go.id", "A step failed, the agent retries", "Session created on your local Chrome", "Agent finished", "OK", "The agent stopped answering"])(
    "stays silent on a technical step: %s",
    (step) => expect(agentSpeech(step)).toBeNull(),
  );
});
