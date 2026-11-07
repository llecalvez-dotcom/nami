export type SpeechEngine = {
  // spoken false: the line ended without being heard (refused, or given up by the watchdog).
  speak: (text: string, done: (spoken?: boolean) => void) => void;
  cancel: () => void;
};

export type SpeechQueue = {
  enqueue: (id: string, text: string) => void;
  clear: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  speaking: () => string | null;
  onSpoken: (listener: (id: string) => void) => () => void;
  // Called whenever the line being spoken changes (a line starts, ends, or the queue is cleared).
  onChange: (listener: () => void) => () => void;
};

// One utterance at a time, in arrival order. Muting cancels the current one and drops what is waiting.
export function createSpeechQueue(engine: SpeechEngine, muted = false): SpeechQueue {
  let waiting: { id: string; text: string }[] = [];
  let current: { id: string; token: number } | null = null;
  let token = 0;
  let isMuted = muted;
  const listeners = new Set<(id: string) => void>();
  const changeListeners = new Set<() => void>();
  const changed = () => changeListeners.forEach((listener) => listener());

  const next = () => {
    if (current || waiting.length === 0) return;
    const item = waiting.shift()!;
    const mine = ++token;
    current = { id: item.id, token: mine };
    changed();
    engine.speak(item.text, (spoken = true) => {
      if (current?.token !== mine) return;
      current = null;
      changed();
      // A card opens its microphone only after a line really heard: otherwise it recorded silence (2026-11-07).
      if (spoken) listeners.forEach((listener) => listener(item.id));
      next();
    });
  };

  const clear = () => {
    waiting = [];
    if (!current) return;
    current = null;
    token++;
    engine.cancel();
    changed();
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
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };
}
