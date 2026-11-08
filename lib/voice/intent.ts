import { z } from "zod";
import type { CompleteJson } from "@/lib/llm";
import type { ConversationItem } from "@/lib/trip-state";
import { matchOption, normalize, shortAnswer } from "@/lib/voice/short-answers";

// What a spoken answer means for the item Nami waits on. The closed word lists (short-answers.ts) answer in 0 ms;
// anything else ("ouais je suis chaud", "le deuxième, celui de Qatar") is read by the H model, then dispatched exactly
// like a tap on the button. Nothing understood, model down or slow: "free", the former behaviour.

export const IntentQuestionSchema = z.object({
  kind: z.enum(["proposal", "question"]),
  text: z.string().max(1000),
  options: z.array(z.object({ id: z.string().min(1).max(200), label: z.string().max(300) })).max(20),
  allow_multiple: z.boolean().optional(),
});
export type IntentQuestion = z.infer<typeof IntentQuestionSchema>;

export const IntentInputSchema = z.object({
  transcript: z.string().trim().min(1).max(2000),
  language: z.string().regex(/^[a-z]{2,3}$/).default("en"),
  question: IntentQuestionSchema,
});
export type IntentInput = z.infer<typeof IntentInputSchema>;

export type Intent = (
  | { kind: "accept" }
  | { kind: "decline" }
  | { kind: "option"; option_ids: string[] }
  | { kind: "free"; text: string }
) & { confidence: number };

export const IntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("accept"), confidence: z.number() }),
  z.object({ kind: z.literal("decline"), confidence: z.number() }),
  z.object({ kind: z.literal("option"), option_ids: z.array(z.string()).min(1), confidence: z.number() }),
  z.object({ kind: z.literal("free"), text: z.string(), confidence: z.number() }),
]);

export const INTENT_TIMEOUT_MS = 4_000;

// A proposal's two buttons, as options the model can name ("search again" picks "Search again").
export const PROPOSAL_ACCEPT_ID = "accept";
export const PROPOSAL_DECLINE_ID = "decline";

// The item the panel waits on, as the question sent to /api/voice/intent; null for an item that is not answered by voice.
export function questionFromItem(item: ConversationItem): IntentQuestion | null {
  if (item.kind === "proposal") {
    return {
      kind: "proposal",
      text: item.text,
      options: [
        { id: PROPOSAL_ACCEPT_ID, label: item.accept_label },
        { id: PROPOSAL_DECLINE_ID, label: item.decline_label },
      ],
    };
  }
  if (item.kind === "question") return { kind: "question", text: item.question, options: item.options.map((o) => ({ id: o.value, label: o.label })) };
  return null;
}

const free = (text: string, confidence = 0): Intent => ({ kind: "free", text, confidence });

// The closed lists, 0 ms: the former behaviour of the panel, kept first. Null when they say nothing.
export function quickIntent({ transcript, question }: Pick<IntentInput, "transcript" | "question">): Intent | null {
  const text = transcript.trim();
  if (!text) return null;
  if (question.kind === "proposal") {
    const answer = shortAnswer("proposal", text);
    return answer ? { kind: answer, confidence: 1 } : null;
  }
  const option = matchOption(text, question.options);
  if (option) return { kind: "option", option_ids: [option.id], confidence: 1 };
  // A spoken "yes" in any language picks the only option of a proposed answer ("Yes, that's right").
  if (question.options.length === 1 && shortAnswer("proposal", text) === "accept") return { kind: "option", option_ids: [question.options[0].id], confidence: 1 };
  return null;
}

const SYSTEM_PROMPT = `You read what a traveller just said in answer to a question of Nami, a voice travel assistant, and return the intention. Nothing else.
The transcript comes from speech recognition, in the traveller's language (ISO 639-1 code given). Expect familiar, slang or regional
words, hesitations ("euh oui", "hmm yeah"), fillers ("bah du coup", "well") and small transcription errors.

Rules:
- "accept": the traveller agrees or asks to go ahead, including familiar ways: "chaud", "je suis chaud", "carrément", "grave", "ça marche",
  "vas-y", "banco", "yep", "sure", "let's go", "why not", "dale", "klar". Only for a proposal (a yes or no question).
- "decline": the traveller refuses, postpones or is lukewarm: "non", "nah", "bof", "mouais pas trop", "not now", "later", "no need".
  A negation wins over a yes word: "non pas maintenant" and "ouais non" are a decline. Only for a proposal.
- "option": the traveller names one of the options, by its label, its meaning, its position ("the second", "le deuxième", "la première")
  or a detail of its label (an airline, a date, a price, a duration). Give the id of that option, copied from the list, nothing else.
- Several options named at once ("the cheapest and the fastest", "le moins cher et le plus rapide"): give ALL their ids,
  separated by commas, in the order they were said. Never reduce them to one: Nami picks the compromise itself.
- "free": anything else: a new piece of information (a date, a city, a number), a question, an aside, or when you are not sure.
  Never invent an id and never guess: when in doubt, "free".
- confidence: "high" when the meaning is plain, "medium" when it takes some reading, "low" when you hesitate.`;

const MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["accept", "decline", "option", "free"] },
    // Ids separated by commas, empty when none: an array in the schema stalls the H model's constrained decoding (lib/translate.ts).
    option_ids: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["intent", "option_ids", "confidence"],
  additionalProperties: false,
};

const ModelOutputSchema = z.object({
  intent: z.enum(["accept", "decline", "option", "free"]),
  option_ids: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const CONFIDENCE: Record<z.infer<typeof ModelOutputSchema>["confidence"], number> = { high: 0.9, medium: 0.6, low: 0.3 };

const COMPROMISE = /\b(best|balance|compromise)\b/i;

function splitIds(raw: string): string[] {
  return [...new Set(raw.split(/[,;\n]/).map((id) => id.trim()).filter(Boolean))];
}

// The model's answer, checked against the question: an option must exist, a proposal has no option but its two buttons,
// a question with several options takes no bare yes or no.
export function intentFromModel(raw: string, { transcript, question }: Pick<IntentInput, "transcript" | "question">): Intent {
  let parsed: z.infer<typeof ModelOutputSchema>;
  try {
    const result = ModelOutputSchema.safeParse(JSON.parse(raw));
    if (!result.success) return free(transcript);
    parsed = result.data;
  } catch {
    return free(transcript);
  }
  const confidence = CONFIDENCE[parsed.confidence];
  if (parsed.intent === "free") return free(transcript, confidence);

  if (parsed.intent === "accept" || parsed.intent === "decline") {
    if (question.kind === "proposal") return { kind: parsed.intent, confidence };
    if (parsed.intent === "accept" && question.options.length === 1) return { kind: "option", option_ids: [question.options[0].id], confidence };
    return free(transcript, confidence);
  }

  const known = new Map(question.options.map((o) => [normalize(o.id), o] as const));
  const options: IntentQuestion["options"] = [];
  for (const id of splitIds(parsed.option_ids)) {
    const option = question.options.find((o) => o.id === id) ?? known.get(normalize(id));
    if (!option) return free(transcript, confidence);
    if (!options.includes(option)) options.push(option);
  }
  if (options.length === 0) return free(transcript, confidence);

  if (question.kind === "proposal") {
    const [first] = options;
    if (options.length === 1 && first.id === PROPOSAL_ACCEPT_ID) return { kind: "accept", confidence };
    if (options.length === 1 && first.id === PROPOSAL_DECLINE_ID) return { kind: "decline", confidence };
    return free(transcript, confidence);
  }
  if (options.length > 1 && !question.allow_multiple) {
    const compromise = question.options.find((o) => COMPROMISE.test(o.label));
    return { kind: "option", option_ids: [(compromise ?? options[0]).id], confidence };
  }
  return { kind: "option", option_ids: options.map((o) => o.id), confidence };
}

export type InterpretOptions = { timeoutMs?: number };

// The quick lists first, then the H model within the timeout; "free" when it fails, is slow or names nothing real.
export async function interpretAnswer(input: IntentInput, complete: CompleteJson, { timeoutMs = INTENT_TIMEOUT_MS }: InterpretOptions = {}): Promise<Intent> {
  const quick = quickIntent(input);
  if (quick) return quick;
  if (input.question.options.length === 0 && input.question.kind === "question") return free(input.transcript);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const raw = await Promise.race([
      complete({
        system: SYSTEM_PROMPT,
        user: JSON.stringify({
          language: input.language,
          question: input.question.text,
          kind: input.question.kind,
          allow_multiple: input.question.allow_multiple ?? false,
          options: input.question.options,
          transcript: input.transcript,
        }),
        schema: MODEL_OUTPUT_JSON_SCHEMA,
      }).catch(() => null),
      timeout,
    ]);
    return raw === null ? free(input.transcript) : intentFromModel(raw, input);
  } finally {
    clearTimeout(timer);
  }
}

// The intent in a few characters, for the server log.
export function describeIntent(intent: Intent): string {
  switch (intent.kind) {
    case "option":
      return `option ${intent.option_ids.join(",")}`;
    case "free":
      return "free";
    default:
      return intent.kind;
  }
}
