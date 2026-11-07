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
import { BALI_PAPERS } from "@/lib/bali-papers";
import type { AgentRun, Formality, ModuleKind, ModuleState, ModuleSuggestion, TripRequestDraft } from "@/lib/contracts";
import { TripRequestSchema } from "@/lib/contracts";
import { isOfficialUrl } from "@/lib/official-sites";
import {
  defaultBaliArrival,
  formalityWindows,
  isBali,
  nextQuestion,
  suggestModules,
  type QuestionField,
} from "@/lib/planner";

export type ProposalAction = "papers" | "create_visa" | "flights";

export type ConversationItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "agent"; text: string }
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

const ACTIVE_AGENT_STATES: AgentRun["state"][] = ["running", "awaiting_tool_results", "paused"];

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
      // From France, the flight to Bali lands the day after departure (17 to 20 h with the 7 h time difference).
      if (!destination || !country_iso2 || !departure_date || !isBali({ destination, country_iso2 })) return [];
      return [{ label: "I don't know yet", value: defaultBaliArrival(addDays(departure_date, 1)) }];
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
            text: "Here are your 3 entry papers, read by hand on the official sites on 7 Nov 2026. Filling them in for you on the official site is not wired yet.",
          },
          FLIGHTS_PROPOSAL,
        );
      }
      return push(
        { ...decided, modules: setModule(decided.modules, "papers", "accepted"), formalities: SAMPLE_FORMALITIES },
        { kind: "agent", text: "Here are your 3 entry papers, with their official links and costs. The visa comes first." },
        {
          kind: "proposal",
          action: "create_visa",
          text: "Shall I fill in your visa (e-VOA) on the official site? I stop before payment: you check, you pay.",
          accept_label: "Create my visa",
          decline_label: "Not now",
          decision: null,
        },
      );
    case "create_visa":
      if (!accepted) return push(decided, { kind: "agent", text: "Okay, the visa can wait." });
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
  const openAgentQuestion = trip.conversation.find((i) => i.kind === "question" && i.from === "agent_h" && i.answer === null);
  const stopped: Trip = {
    ...trip,
    agent_run: { ...trip.agent_run, state: "interrupted", pending_question: undefined },
    agent_steps: [...trip.agent_steps, "Stopped by you"],
  };
  const withQuestionClosed = openAgentQuestion ? updateItem(stopped, openAgentQuestion.id, { answer: "Agent stopped" }) : stopped;
  return push(withQuestionClosed, { kind: "agent", text: "Agent stopped. Nothing was submitted." });
}
