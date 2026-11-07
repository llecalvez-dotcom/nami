// Short spoken answers that are sent without a click. One entry per card kind, one word list per outcome.
export const SHORT_ANSWERS = {
  proposal: {
    accept: ["yes", "yeah", "oui", "ok", "okay", "go", "vas-y"],
    decline: ["no", "non", "later", "plus tard", "not now"],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type ShortAnswerKind = keyof typeof SHORT_ANSWERS;
export type ShortAnswer<K extends ShortAnswerKind> = keyof (typeof SHORT_ANSWERS)[K] & string;

// A short answer is a few words, all taken from one list ("oui", "ok go", "yes yes"); anything longer is a sentence.
const MAX_SHORT_WORDS = 4;

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const words = (text: string) => {
  const n = normalize(text);
  return n ? n.split(" ") : [];
};

function coveredBy(tokens: string[], phrases: string[][]): boolean {
  const reachable = new Array<boolean>(tokens.length + 1).fill(false);
  reachable[0] = true;
  for (let i = 0; i < tokens.length; i++) {
    if (!reachable[i]) continue;
    for (const phrase of phrases) {
      if (phrase.length > 0 && phrase.every((word, j) => tokens[i + j] === word)) reachable[i + phrase.length] = true;
    }
  }
  return reachable[tokens.length];
}

export function shortAnswer<K extends ShortAnswerKind>(kind: K, transcript: string): ShortAnswer<K> | null {
  const tokens = words(transcript);
  if (tokens.length === 0 || tokens.length > MAX_SHORT_WORDS) return null;
  const lists = SHORT_ANSWERS[kind] as Record<string, readonly string[]>;
  const found = Object.keys(lists).filter((key) => coveredBy(tokens, lists[key].map(words)));
  return found.length === 1 ? (found[0] as ShortAnswer<K>) : null;
}

function contains(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true;
  }
  return false;
}

// The option whose label was said ("holiday", "it's for business") or that starts with what was said ("yes" for
// "Yes, French passport"). Several or none: null, the transcript goes out as a free answer.
export function matchOption<T extends { label: string }>(transcript: string, options: readonly T[]): T | null {
  const said = words(transcript);
  if (said.length === 0) return null;
  const saidText = said.join(" ");
  const matches = options.filter((option) => {
    const label = words(option.label);
    return contains(said, label) || (saidText.length >= 3 && contains(label, said));
  });
  return matches.length === 1 ? matches[0] : null;
}

// "nathan dot skwarek at gmail dot com" becomes "nathan.skwarek@gmail.com"; the user still reads it before Validate.
export function spokenEmail(transcript: string): string {
  return transcript
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+(at|arobase)\s+/g, "@")
    .replace(/\s+(dot|point)\s+/g, ".")
    .replace(/\s+/g, "")
    .replace(/[.,;!?]+$/, "");
}
