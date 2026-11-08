// How the traveller answers Nami: by voice (the microphone opens by itself after each sentence) or by typing (the text
// field comes first and the microphone waits to be tapped). Buttons and the microphone on the wave stay in both modes.
// The choice survives a reload (localStorage); when storage fails, Nami stays in Voice mode (ticket 20).
export type AnswerMode = "voice" | "typing";

export const ANSWER_MODE_KEY = "nami.answer.mode";

type Storage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

const storageOf = (storage?: Storage | null): Storage | null => {
  if (storage !== undefined) return storage;
  return typeof localStorage === "undefined" ? null : localStorage;
};

export function readAnswerMode(storage?: Storage | null): AnswerMode {
  try {
    return storageOf(storage)?.getItem(ANSWER_MODE_KEY) === "typing" ? "typing" : "voice";
  } catch {
    return "voice";
  }
}

export function writeAnswerMode(mode: AnswerMode, storage?: Storage | null): void {
  try {
    storageOf(storage)?.setItem(ANSWER_MODE_KEY, mode);
  } catch {}
}

// Voice mode only: in Typing mode the microphone never opens on its own, the field is already there.
export const listensAutomatically = (mode: AnswerMode): boolean => mode === "voice";
