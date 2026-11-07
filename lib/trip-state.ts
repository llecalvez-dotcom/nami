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
import type { AgentRun, Formality, ModuleKind, ModuleState, ModuleSuggestion, TripRequestDraft } from "@/lib/contracts";
import { TripRequestDraftSchema } from "@/lib/contracts";

export type ProposalAction = "papers" | "create_visa" | "flights";

export type ConversationItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "agent"; text: string }
  | {
      id: string;
      kind: "question";
      from: "nami" | "agent_h";
      field: "arrival_at" | "email";
      question: string;
      options: { label: string; value: string }[];
      input: "email" | null;
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
  const rest = modules.filter((m) => m.module !== module);
  return [...rest, { ...suggestion(module), state }];
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

export function createTripFromText(id: string, text: string, now: Date): Trip {
  const trip: Trip = {
    id,
    created_at: now.toISOString(),
    sample: false,
    request: TripRequestDraftSchema.parse({ raw_text: text }),
    conversation: [],
    modules: [suggestion("hotel")],
    formalities: [],
    agent_run: null,
    agent_steps: [],
  };
  return push(
    trip,
    { kind: "user", text },
    {
      kind: "agent",
      text: "Your request is saved. I can't read trip requests yet: that part is being built. Open the sample Bali trip to walk through the flow.",
    },
  );
}

export function answerQuestion(trip: Trip, itemId: string, value: string, label: string): Trip {
  const item = trip.conversation.find((i) => i.id === itemId);
  if (!item || item.kind !== "question" || item.answer !== null) return trip;
  const answered = updateItem(trip, itemId, { answer: label });

  if (item.field === "arrival_at") {
    return push(
      { ...answered, request: { ...answered.request, arrival_at: value }, modules: setModule(answered.modules, "papers", "suggested") },
      {
        kind: "proposal",
        action: "papers",
        text: suggestion("papers").message,
        accept_label: "Prepare my entry papers",
        decline_label: "Not now",
        decision: null,
      },
    );
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
      agent_steps: [...answered.agent_steps, "Typed the contact e-mail", "Reached the payment screen — stopped, nothing clicked"],
      formalities: answered.formalities.map((f) => (f.id === "evoa" ? { ...f, status: "pending_approval" } : f)),
      modules: setModule(answered.modules, "flights", "suggested"),
    },
    {
      kind: "agent",
      text: "Visa (e-VOA) pre-filled in Chrome. Check every field, then finish it yourself: payment of IDR 500,000 on the official site.",
    },
    {
      kind: "proposal",
      action: "flights",
      text: suggestion("flights").message,
      accept_label: "Find my flight",
      decline_label: "Not now",
      decision: null,
    },
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
