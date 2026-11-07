import { INVALID_AGENT_ANSWER, parseAgentAnswer } from "@/lib/agent-answer";
import {
  SAMPLE_AGENT_RUN,
  SAMPLE_AGENT_STEPS,
  SAMPLE_DRAFT,
  SAMPLE_EMAIL_QUESTION,
  SAMPLE_FILLED_FIELDS,
  SAMPLE_FORMALITIES,
  SAMPLE_LANDING_OPTIONS,
  SAMPLE_SUGGESTIONS,
  SAMPLE_TRIP_ID,
} from "@/data/sample";
import { freshToolCalls, redact, toolCallKey, type AgentChanges } from "@/lib/agent-changes";
import { BALI_PAPERS, getBaliPaper } from "@/lib/bali-papers";
import { AgentStateSchema } from "@/lib/contracts";
import { isTerminalStatus, type ToolRequest } from "@/lib/h-agent";
import type { AgentRun, Formality, ModuleKind, ModuleState, ModuleSuggestion, TripRequestDraft } from "@/lib/contracts";
import { TripRequestSchema } from "@/lib/contracts";
import { isOfficialUrl } from "@/lib/official-sites";
import {
  formalityWindows,
  isBali,
  nextQuestion,
  suggestModules,
  type QuestionField,
} from "@/lib/planner";

// read_passport, confirm_passport, use_photo: the side panel's spoken steps before the visa agent starts.
export type ProposalAction = "papers" | "create_visa" | "flights" | "read_passport" | "confirm_passport" | "use_photo";

export type ConversationItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "agent"; text: string; list?: string[] }
  | {
      id: string;
      kind: "agent_question";
      tool_req: ToolRequest;
      question: string;
      field: string;
      answer: string | null;
    }
  | {
      id: string;
      kind: "question";
      from: "nami" | "agent_h";
      field: QuestionField | "email";
      question: string;
      options: { label: string; value: string }[];
      input: "email" | "text" | null;
      answer: string | null;
    }
  | {
      id: string;
      kind: "proposal";
      action: ProposalAction;
      text: string;
      accept_label: string;
      decline_label: string;
      decision: "accepted" | "declined" | null;
    };

export type Trip = {
  id: string;
  created_at: string;
  sample: boolean;
  request: TripRequestDraft;
  conversation: ConversationItem[];
  modules: ModuleSuggestion[];
  formalities: Formality[];
  agent_run: AgentRun | null;
  agent_steps: string[];
};

type NewConversationItem = ConversationItem extends infer T ? (T extends ConversationItem ? Omit<T, "id"> : never) : never;

const ACTIVE_AGENT_STATES: AgentRun["state"][] = ["pending", "queued", "running", "awaiting_tool_results", "paused"];

export const VISA_READY_MESSAGE = "I stopped before sending anything: the next step sends your data to the Indonesian government. Check the form in the tab, then continue yourself.";

// After a reload the confirmed passport is gone (never stored): nothing from H is read, so nothing is saved unmasked, until it is confirmed again.
export function needsPassportReconfirm(run: AgentRun | null, passportConfirmed: boolean): boolean {
  return run !== null && !run.drained && !passportConfirmed;
}

export function isAgentActive(run: AgentRun | null): boolean {
  return run !== null && ACTIVE_AGENT_STATES.includes(run.state);
}

function suggestion(module: ModuleKind): ModuleSuggestion {
  const found = SAMPLE_SUGGESTIONS.find((s) => s.module === module);
  if (!found) throw new Error(`No sample suggestion for ${module}`);
  return found;
}

function setModule(modules: ModuleSuggestion[], module: ModuleKind, state: ModuleState): ModuleSuggestion[] {
  const existing = modules.find((m) => m.module === module);
  const rest = modules.filter((m) => m.module !== module);
  return [...rest, { ...(existing ?? suggestion(module)), state }];
}

const FLIGHTS_PROPOSAL: NewConversationItem = {
  kind: "proposal",
  action: "flights",
  text: suggestion("flights").message,
  accept_label: "Find my flight",
  decline_label: "Not now",
  decision: null,
};

// The flights come once the visa is ready, never next to it.
const FLIGHTS_AFTER_VISA: NewConversationItem = {
  ...FLIGHTS_PROPOSAL,
  text: "Do you also want me to help you find your flights?",
} as NewConversationItem;

const CREATE_VISA_PROPOSAL: NewConversationItem = {
  kind: "proposal",
  action: "create_visa",
  text: "For Bali you need an e-VOA. Shall I fill it in for you on the official site? I stop before anything is sent: you check, you send.",
  accept_label: "Create my visa",
  decline_label: "Not now",
  decision: null,
};

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function questionOptions(field: QuestionField, request: TripRequestDraft): { label: string; value: string }[] {
  switch (field) {
    case "nationality":
      return [{ label: "Yes, French passport", value: "FR" }];
    case "origin_country":
      return [{ label: "Yes, from France", value: "FR" }];
    case "arrival_at": {
      const { destination, country_iso2, departure_date } = request;
      // From France, the flight to Bali lands the day after departure (17 to 20 h with the 7 h time difference):
      // Nami proposes the evening of that day, the traveller confirms it or gives the landing time.
      if (!destination || !country_iso2 || !departure_date || !isBali({ destination, country_iso2 })) return [];
      return [{ label: "Yes, that's right", value: `${addDays(departure_date, 1)}T18:00+08:00` }];
    }
    case "purpose":
      return [
        { label: "Holiday", value: "tourism" },
        { label: "Business", value: "business" },
        { label: "Family", value: "family" },
      ];
    case "travellers":
      return [
        { label: "Just me", value: "1" },
        { label: "Two", value: "2" },
      ];
    default:
      return [];
  }
}

function advance(trip: Trip): Trip {
  const question = nextQuestion(trip.request);
  if (question) {
    return push(trip, {
      kind: "question",
      from: "nami",
      field: question.field,
      question: question.question,
      options: questionOptions(question.field, trip.request),
      input: "text",
      answer: null,
    });
  }

  const suggestions = suggestModules(TripRequestSchema.parse(trip.request));
  const papers = suggestions.find((s) => s.module === "papers")!;
  if (papers.state === "suggested") {
    return push(
      { ...trip, modules: suggestions.filter((s) => s.module !== "flights") },
      {
        kind: "proposal",
        action: "papers",
        text: papers.message,
        accept_label: "Prepare my entry papers",
        decline_label: "Not now",
        decision: null,
      },
    );
  }
  return push({ ...trip, modules: suggestions }, { kind: "agent", text: papers.message }, FLIGHTS_PROPOSAL);
}

function baliFormalities(request: TripRequestDraft): Formality[] {
  const windows = request.arrival_at ? formalityWindows({ arrival_at: request.arrival_at }, BALI_PAPERS) : [];
  return BALI_PAPERS.map((paper) => ({
    id: paper.id,
    name: paper.name,
    required: true,
    official_url: paper.official_url,
    official_cost: paper.official_cost,
    opens_at: windows.find((w) => w.id === paper.id)?.opens_at ?? null,
    closes_at: windows.find((w) => w.id === paper.id)?.closes_at ?? null,
    sources: paper.source_urls.map((url) => ({ url, official: isOfficialUrl(url) })),
    status: "suggested",
    checked_at: null,
  }));
}

function nextId(trip: Trip): string {
  return `${trip.id}-${trip.conversation.length + 1}`;
}

function push(trip: Trip, ...items: NewConversationItem[]): Trip {
  return items.reduce<Trip>(
    (t, item) => ({ ...t, conversation: [...t.conversation, { ...item, id: nextId(t) } as ConversationItem] }),
    trip,
  );
}

function updateItem(trip: Trip, id: string, patch: Partial<ConversationItem>): Trip {
  return {
    ...trip,
    conversation: trip.conversation.map((item) => (item.id === id ? ({ ...item, ...patch } as ConversationItem) : item)),
  };
}

export function createSampleTrip(now: Date): Trip {
  const trip: Trip = {
    id: SAMPLE_TRIP_ID,
    created_at: now.toISOString(),
    sample: true,
    request: SAMPLE_DRAFT,
    conversation: [],
    modules: [suggestion("hotel")],
    formalities: [],
    agent_run: null,
    agent_steps: [],
  };
  return push(
    trip,
    { kind: "user", text: SAMPLE_DRAFT.raw_text },
    { kind: "agent", text: "Bali, Monday 9 to Friday 20 November, for a friend's wedding. One thing I need:" },
    {
      kind: "question",
      from: "nami",
      field: "arrival_at",
      question: "When do you land in Bali?",
      options: SAMPLE_LANDING_OPTIONS.map((o) => ({ label: o.label, value: o.arrival_at })),
      input: null,
      answer: null,
    },
  );
}

export function createTripFromRequest(id: string, request: TripRequestDraft, now: Date): Trip {
  const trip: Trip = {
    id,
    created_at: now.toISOString(),
    sample: false,
    request,
    conversation: [],
    modules: [suggestion("hotel")],
    formalities: [],
    agent_run: null,
    agent_steps: [],
  };
  return advance(push(trip, { kind: "user", text: request.raw_text }));
}

export function answerQuestionWithText(trip: Trip, itemId: string, text: string, request: TripRequestDraft): Trip {
  const item = trip.conversation.find((i) => i.id === itemId);
  if (!item || item.kind !== "question" || item.from !== "nami" || item.answer !== null) return trip;
  const answered = { ...updateItem(trip, itemId, { answer: text }), request };
  const stillMissing = item.field !== "email" && request[item.field] === null;
  return advance(stillMissing ? push(answered, { kind: "agent", text: "Sorry, I didn't catch that." }) : answered);
}

export function answerQuestion(trip: Trip, itemId: string, value: string, label: string): Trip {
  const item = trip.conversation.find((i) => i.id === itemId);
  if (!item || item.kind !== "question" || item.answer !== null) return trip;
  const answered = updateItem(trip, itemId, { answer: label });

  if (item.field !== "email") {
    const fieldValue = item.field === "travellers" ? Number(value) : value;
    return advance({ ...answered, request: { ...answered.request, [item.field]: fieldValue } });
  }

  if (!answered.agent_run || !isAgentActive(answered.agent_run)) return answered;
  return push(
    {
      ...answered,
      agent_run: {
        ...answered.agent_run,
        state: "completed",
        pending_question: undefined,
        result: { summary: "Reached the payment screen. Nothing clicked on it.", filled_fields: SAMPLE_FILLED_FIELDS },
      },
      agent_steps: [...answered.agent_steps, "Typed the contact e-mail", "Reached the payment screen, stopped, nothing clicked"],
      formalities: answered.formalities.map((f) => (f.id === "evoa" ? { ...f, status: "pending_approval" } : f)),
      modules: setModule(answered.modules, "flights", "suggested"),
    },
    {
      kind: "agent",
      text: "Visa (e-VOA) pre-filled in Chrome. Check every field, then finish it yourself: payment of IDR 500,000 on the official site.",
    },
    FLIGHTS_PROPOSAL,
  );
}

export function decideProposal(trip: Trip, itemId: string, accepted: boolean, now: Date): Trip {
  const item = trip.conversation.find((i) => i.id === itemId);
  if (!item || item.kind !== "proposal" || item.decision !== null) return trip;
  const decided = updateItem(trip, itemId, { decision: accepted ? "accepted" : "declined" });

  switch (item.action) {
    case "papers":
      if (!accepted) {
        return push(
          { ...decided, modules: setModule(decided.modules, "papers", "declined") },
          { kind: "agent", text: "Okay. Your trip is saved; ask me for your papers anytime." },
        );
      }
      if (!trip.sample) {
        return push(
          {
            ...decided,
            modules: setModule(setModule(decided.modules, "papers", "accepted"), "flights", "suggested"),
            formalities: baliFormalities(decided.request),
          },
          {
            kind: "agent",
            text: "Here are your 3 entry papers, read by hand on the official sites on 7 Nov 2026. The visa comes first.",
          },
          CREATE_VISA_PROPOSAL,
        );
      }
      return push(
        { ...decided, modules: setModule(decided.modules, "papers", "accepted"), formalities: SAMPLE_FORMALITIES },
        { kind: "agent", text: "Here are your 3 entry papers, with their official links and costs. The visa comes first." },
        CREATE_VISA_PROPOSAL,
      );
    case "create_visa":
      if (!accepted) return push(decided, { kind: "agent", text: "Okay, the visa can wait." });
      // A real trip starts a real H session: see startVisaRun, called once the session exists.
      if (!trip.sample) return trip;
      return push(
        {
          ...decided,
          agent_run: { ...SAMPLE_AGENT_RUN, started_at: now.toISOString() },
          agent_steps: SAMPLE_AGENT_STEPS,
        },
        { kind: "agent", text: "The agent is filling in your visa on evisa.imigrasi.go.id." },
        {
          kind: "question",
          from: "agent_h",
          field: "email",
          question: SAMPLE_EMAIL_QUESTION.question,
          options: [],
          input: "email",
          answer: null,
        },
      );
    case "read_passport":
    case "confirm_passport":
    case "use_photo":
      return decided;
    case "flights":
      return push(
        { ...decided, modules: setModule(decided.modules, "flights", accepted ? "accepted" : "declined") },
        {
          kind: "agent",
          text: accepted ? "Noted. Flight search is not wired yet; your choice is saved." : "Okay, no flight search for now.",
        },
      );
  }
}

export function stopAgent(trip: Trip): Trip {
  if (!trip.agent_run || !isAgentActive(trip.agent_run)) return trip;
  const openAgentQuestion = trip.conversation.find(
    (i) => (i.kind === "agent_question" || (i.kind === "question" && i.from === "agent_h")) && i.answer === null,
  );
  const stopped: Trip = {
    ...trip,
    agent_run: { ...trip.agent_run, state: "interrupted", pending_question: undefined },
    agent_steps: [...trip.agent_steps, "Stopped by you"],
  };
  const withQuestionClosed = openAgentQuestion ? updateItem(stopped, openAgentQuestion.id, { answer: "Agent stopped" }) : stopped;
  return push(withQuestionClosed, { kind: "agent", text: "Agent stopped. Nothing was submitted." });
}

// Live H session (ticket 05, part A). The passport number and birth date are masked before anything is stored.

export function pushProposal(trip: Trip, action: ProposalAction, text: string, acceptLabel: string, declineLabel: string): Trip {
  return push(trip, { kind: "proposal", action, text, accept_label: acceptLabel, decline_label: declineLabel, decision: null });
}

// Marks a proposal as accepted without its side effect (the side panel runs it itself).
export function acceptProposal(trip: Trip, itemId: string): Trip {
  const item = trip.conversation.find((i) => i.id === itemId);
  return item?.kind === "proposal" && item.decision === null ? updateItem(trip, itemId, { decision: "accepted" }) : trip;
}

export function pushAgentMessage(trip: Trip, text: string): Trip {
  return push(trip, { kind: "agent", text });
}

export function startVisaRun(trip: Trip, itemId: string, sessionId: string, now: Date, passportFileReady = false): Trip {
  const item = trip.conversation.find((i) => i.id === itemId);
  // Already "accepted" when the side panel went looking for the passport first; never a second run.
  if (!item || item.kind !== "proposal" || item.action !== "create_visa" || item.decision === "declined" || isAgentActive(trip.agent_run)) return trip;
  const evoa = getBaliPaper("evoa");
  return push(
    {
      ...updateItem(trip, itemId, { decision: "accepted" }),
      agent_run: {
        session_id: sessionId,
        kind: "paper",
        started_at: now.toISOString(),
        state: "pending",
        next_index: 0,
        handled_tool_ids: [],
        drained: false,
      },
      agent_steps: [
        "Session created on your local Chrome",
        ...(passportFileReady ? ["Passport file ready for the agent"] : []),
      ],
    },
    { kind: "agent", text: `The agent is filling in your visa on ${evoa.domain}, in your Chrome. Keep your hand on Stop agent.` },
  );
}

function withRun(trip: Trip, patch: Partial<AgentRun>): Trip {
  return trip.agent_run ? { ...trip, agent_run: { ...trip.agent_run, ...patch } } : trip;
}

function closeAgentQuestions(trip: Trip, answer: string): Trip {
  return {
    ...trip,
    conversation: trip.conversation.map((i) => (i.kind === "agent_question" && i.answer === null ? { ...i, answer } : i)),
  };
}

export function applyAgentChanges(
  trip: Trip,
  changes: AgentChanges,
  secrets: readonly (string | null | undefined)[],
): { trip: Trip; toolCalls: ToolRequest[] } {
  const run = trip.agent_run;
  if (!run) return { trip, toolCalls: [] };
  const parsed = AgentStateSchema.safeParse(changes.status);
  const hStatus = parsed.success ? parsed.data : run.h_status;
  const hTerminal = hStatus !== undefined && isTerminalStatus(hStatus);
  // Stopped here (Stop agent, or off the official site): a late "running" from H does not reopen the run.
  const stoppedHere = run.state === "interrupted" && !(run.h_status && isTerminalStatus(run.h_status));
  const state = changes.left_official_site || (stoppedHere && !hTerminal) ? "interrupted" : (hStatus ?? run.state);
  const wasTerminal = isTerminalStatus(run.state);
  const terminal = isTerminalStatus(state);
  const steps = changes.steps
    .map((s) => redact(s, secrets))
    .filter((s, i, all) => s !== (i === 0 ? trip.agent_steps.at(-1) : all[i - 1]));
  const hasFinalAnswer = state === "completed" && (changes.answer !== null || (changes.no_change && !run.result?.answer));
  const finalAnswer = hasFinalAnswer ? parseAgentAnswer(changes.answer) : null;
  const answer = hasFinalAnswer ? (finalAnswer ? redact(finalAnswer.summary, secrets) : INVALID_AGENT_ANSWER) : null;
  const finalResult = finalAnswer ? {
    ...finalAnswer,
    summary: redact(finalAnswer.summary, secrets),
    filled_fields: finalAnswer.filled_fields?.map((field) => redact(field, secrets)),
    missing_fields: finalAnswer.missing_fields?.map((field) => redact(field, secrets)),
    blocked_reason: finalAnswer.blocked_reason ? redact(finalAnswer.blocked_reason, secrets) : finalAnswer.blocked_reason,
  } : null;

  if (stoppedHere && hTerminal) steps.push("H confirmed the session is stopped");

  let next: Trip = {
    ...trip,
    agent_steps: [...trip.agent_steps, ...steps],
    agent_run: {
      ...run,
      state,
      h_status: hStatus,
      next_index: changes.next_index,
      metrics: changes.metrics ?? run.metrics,
      drained: hTerminal && changes.no_change,
      result: answer ? { ...run.result, answer, final_answer: finalResult, answer_validation_failed: !finalAnswer } : run.result,
      error: changes.error_code ?? run.error,
    },
  };

  if (terminal && !wasTerminal) {
    next = { ...closeAgentQuestions(next, "Agent stopped"), agent_run: { ...next.agent_run!, pending_question: undefined } };
    const reachedPayment = typeof run.result?.summary === "string";
    if (changes.left_official_site) {
      const host = redact(changes.left_official_site, secrets);
      next = pushAgentMessage(
        next,
        `Agent stopped: it left the official site (${host}).${changes.cancel_failed ? " Run holo local stop in a terminal to stop it." : ""}`,
      );
    } else if ((state === "failed" || state === "timed_out") && changes.error_code !== "answer_validation") {
      next = pushAgentMessage(next, `The agent stopped before the end (${changes.error_code ?? state}). Nothing was submitted.`);
    } else if (state === "completed" && !reachedPayment) {
      next = pushAgentMessage(next, "The agent finished without reaching the payment screen. Nothing was submitted.");
    } else if (state === "interrupted") {
      next = pushAgentMessage(next, "The agent session was closed. Nothing was submitted.");
    }
  }

  if (!run.result?.answer_validation_failed && run.error !== "answer_validation"
    && ((hasFinalAnswer && !finalAnswer) || changes.error_code === "answer_validation")) {
    next = pushAgentMessage(next, INVALID_AGENT_ANSWER);
  }

  const toolCalls = terminal ? [] : freshToolCalls(changes.pending_tool_calls, run.handled_tool_ids ?? []);
  return { trip: next, toolCalls };
}

function markHandled(trip: Trip, call: ToolRequest): Trip {
  const handled = trip.agent_run?.handled_tool_ids ?? [];
  const key = toolCallKey(call);
  return handled.includes(key) ? trip : withRun(trip, { handled_tool_ids: [...handled, key] });
}

export function isToolHandled(trip: Trip, call: ToolRequest): boolean {
  return (trip.agent_run?.handled_tool_ids ?? []).includes(toolCallKey(call));
}

export function askUserFromAgent(trip: Trip, call: ToolRequest, secrets: readonly (string | null | undefined)[]): Trip {
  const key = toolCallKey(call);
  const shown = trip.conversation.some((i) => i.kind === "agent_question" && toolCallKey(i.tool_req) === key);
  if (shown || isToolHandled(trip, call)) return trip;
  const question = redact(typeof call.args.question === "string" && call.args.question.trim() ? call.args.question : "The agent needs your help in Chrome.", secrets);
  const field = typeof call.args.field === "string" ? call.args.field : "";
  // Stored in localStorage: string args are masked like the question. The raw call stays in memory (use-agent-run).
  const args = Object.fromEntries(Object.entries(call.args).map(([k, v]) => [k, typeof v === "string" ? redact(v, secrets) : v]));
  return push(withRun(trip, { pending_question: { tool_req: key, question, field } }), {
    kind: "agent_question",
    // id kept as the raw key, so the masked copy still matches the call H sent.
    tool_req: { ...call, args, id: key },
    question,
    field,
    answer: null,
  });
}

// Returns the trip unchanged when the card was already answered: the caller then sends nothing.
export function answerAgentQuestion(trip: Trip, itemId: string, value: string): Trip {
  const item = trip.conversation.find((i) => i.id === itemId);
  if (!item || item.kind !== "agent_question" || item.answer !== null || isToolHandled(trip, item.tool_req)) return trip;
  return withRun(markHandled(updateItem(trip, itemId, { answer: value }), item.tool_req), { pending_question: undefined });
}

export function reopenAgentQuestion(trip: Trip, itemId: string): Trip {
  const item = trip.conversation.find((i) => i.id === itemId);
  if (!item || item.kind !== "agent_question" || !trip.agent_run) return trip;
  const key = toolCallKey(item.tool_req);
  const reopened = withRun(updateItem(trip, itemId, { answer: null }), {
    handled_tool_ids: (trip.agent_run.handled_tool_ids ?? []).filter((k) => k !== key),
    pending_question: { tool_req: key, question: item.question, field: item.field },
  });
  return pushAgentMessage(reopened, "Your answer could not be sent to the agent. Try again.");
}

export function reportReady(trip: Trip, call: ToolRequest, secrets: readonly (string | null | undefined)[]): Trip {
  if (!trip.agent_run || isToolHandled(trip, call)) return trip;
  const summary = redact(typeof call.args.summary === "string" ? call.args.summary : "", secrets);
  const filled = Array.isArray(call.args.filled_fields)
    ? call.args.filled_fields.filter((f): f is string => typeof f === "string").map((f) => redact(f, secrets))
    : [];
  const marked = markHandled(trip, call);
  return push(
    {
      ...withRun(closeAgentQuestions(marked, "Agent stopped"), { state: "interrupted", drained: true, pending_question: undefined, result: { ...marked.agent_run!.result, summary, filled_fields: filled } }),
      agent_steps: [...marked.agent_steps, "Nami stopped the agent at the payment page so you can check and pay"],
      formalities: marked.formalities.map((f) => (f.id === "evoa" ? { ...f, status: "pending_approval" } : f)),
    },
    { kind: "agent", text: VISA_READY_MESSAGE, list: filled },
    FLIGHTS_AFTER_VISA,
  );
}

export function markToolHandled(trip: Trip, call: ToolRequest): Trip {
  return markHandled(trip, call);
}

export function recordPassportUpload(trip: Trip, call: ToolRequest, result: string | null): Trip {
  if (!trip.agent_run || (trip.agent_run.handled_tool_ids ?? []).includes(toolCallKey(call))) return trip;
  const next = markToolHandled(trip, call);
  return result === "uploaded"
    ? { ...next, agent_steps: [...next.agent_steps, "Nami gave the passport to the agent"] }
    : next;
}
