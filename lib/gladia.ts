const GLADIA_API = "https://api.gladia.io/v2";

export class GladiaError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "failed",
  ) {
    super(message);
    this.name = "GladiaError";
  }
}

type Options = {
  apiKey: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetch?: typeof fetch;
};

type PreRecordedJob = {
  status: "queued" | "processing" | "done" | "error";
  error_code?: number | null;
  result?: { transcription?: { full_transcript?: string; languages?: string[] } } | null;
};

// language: the ISO 639-1 code Gladia detected (any of its 100+ languages), or null.
export type Transcript = { text: string; language: string | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function transcribeWithGladia(audio: Blob, options: Options): Promise<string> {
  return (await transcribeWithLanguage(audio, options)).text;
}

export async function transcribeWithLanguage(audio: Blob, options: Options): Promise<Transcript> {
  const { apiKey, timeoutMs = 30_000, pollIntervalMs = 1_000, fetch: fetchImpl = fetch } = options;
  const deadline = Date.now() + timeoutMs;
  const signal = AbortSignal.timeout(timeoutMs);

  async function call<T>(step: string, path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${GLADIA_API}${path}`, {
        ...init,
        headers: { "x-gladia-key": apiKey, ...init.headers },
        signal,
      });
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "TimeoutError")) {
        throw new GladiaError("Transcription took too long.", "timeout");
      }
      throw new GladiaError(`Gladia ${step} unreachable.`, "failed");
    }
    if (!response.ok) throw new GladiaError(`Gladia ${step} failed (${response.status}).`, "failed");
    return (await response.json()) as T;
  }

  const form = new FormData();
  form.append("audio", audio, audio instanceof File && audio.name ? audio.name : "voice.webm");
  const { audio_url } = await call<{ audio_url: string }>("upload", "/upload", { method: "POST", body: form });

  const { id } = await call<{ id: string }>("job creation", "/pre-recorded", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // No language list: Gladia detects the traveller's language among all it knows, and Nami answers in it.
    body: JSON.stringify({ audio_url }),
  });

  for (;;) {
    const job = await call<PreRecordedJob>("result", `/pre-recorded/${id}`, { method: "GET" });
    if (job.status === "done") {
      const transcription = job.result?.transcription;
      const language = transcription?.languages?.[0];
      return {
        text: transcription?.full_transcript?.trim() ?? "",
        language: typeof language === "string" && /^[a-z]{2,3}$/.test(language) ? language : null,
      };
    }
    if (job.status === "error") throw new GladiaError(`Gladia transcription failed (${job.error_code ?? "unknown"}).`, "failed");
    if (Date.now() + pollIntervalMs > deadline) throw new GladiaError("Transcription took too long.", "timeout");
    await sleep(pollIntervalMs);
  }
}
