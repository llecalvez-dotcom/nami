export type SpeechEngine = {
  speak: (text: string, done: () => void) => void;
  cancel: () => void;
};

export type SpeechQueue = {
  enqueue: (id: string, text: string) => void;
  clear: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  speaking: () => string | null;
  onSpoken: (listener: (id: string) => void) => () => void;
};

// One utterance at a time, in arrival order. Muting cancels the current one and drops what is waiting.
export function createSpeechQueue(engine: SpeechEngine, muted = false): SpeechQueue {
  let waiting: { id: string; text: string }[] = [];
  let current: { id: string; token: number } | null = null;
  let token = 0;
  let isMuted = muted;
  const listeners = new Set<(id: string) => void>();

  const next = () => {
    if (current || waiting.length === 0) return;
    const item = waiting.shift()!;
    const mine = ++token;
    current = { id: item.id, token: mine };
    engine.speak(item.text, () => {
      if (current?.token !== mine) return;
      current = null;
      listeners.forEach((listener) => listener(item.id));
      next();
    });
  };

  const clear = () => {
    waiting = [];
    if (!current) return;
    current = null;
    token++;
    engine.cancel();
  };

  return {
    enqueue(id, text) {
      if (isMuted || !text.trim()) return;
      waiting.push({ id, text });
      next();
    },
    clear,
    setMuted(value) {
      isMuted = value;
      if (value) clear();
    },
    isMuted: () => isMuted,
    speaking: () => current?.id ?? null,
    onSpoken(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
