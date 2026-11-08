const GLADIA_API = "https://api.gladia.io/v2";

export class GladiaError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "failed",
    readonly status?: number,
  ) {
    super(message);
    this.name = "GladiaError";
  }
}

type Options = {
  apiKey: string;
  // Languages Gladia may pick from (ISO 639-1). Empty: Gladia detects among all it knows. Default: GLADIA_LANGUAGES.
  languages?: string[];
  // Words Gladia should favour. Empty: none. Default: TRAVEL_VOCABULARY unless GLADIA_VOCABULARY=off.
  vocabulary?: string[];
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

// The words of the demo a general speech model mishears: places, airports, airlines, the papers' names.
// Not "Nami": "le mariage d'un ami" would be heard as "d'un Nami".
export const TRAVEL_VOCABULARY = [
  "Bali",
  "Denpasar",
  "Ngurah Rai",
  "e-VOA",
  "All Indonesia",
  "Indonésie",
  "Toulouse",
  "Roissy",
  "Charles de Gaulle",
  "Kuala Lumpur",
  "Doha",
  "Singapour",
  "Qatar Airways",
  "Emirates",
  "Malaysia Airlines",
  "Singapore Airlines",
  "Turkish Airlines",
  "KLM",
  "Air France",
] as const;

// GLADIA_LANGUAGES=fr,en restricts detection (short answers like "oui" or "ok" are then never read as German);
// unset or empty keeps the detection among all languages, so Nami answers in the traveller's own language.
export function languagesFromEnv(value: string | undefined = process.env.GLADIA_LANGUAGES): string[] {
  return (value ?? "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter((code) => /^[a-z]{2,3}$/.test(code));
}

export function vocabularyFromEnv(value: string | undefined = process.env.GLADIA_VOCABULARY): string[] {
  return value?.trim().toLowerCase() === "off" ? [] : [...TRAVEL_VOCABULARY];
}

export function preRecordedBody(audioUrl: string, languages: string[], vocabulary: string[]): Record<string, unknown> {
  return {
    audio_url: audioUrl,
    ...(languages.length > 0 ? { language_config: { languages, code_switching: languages.length > 1 } } : {}),
    ...(vocabulary.length > 0
      ? { custom_vocabulary: true, custom_vocabulary_config: { vocabulary, default_intensity: 0.5 } }
      : {}),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function transcribeWithGladia(audio: Blob, options: Options): Promise<string> {
  return (await transcribeWithLanguage(audio, options)).text;
}

export async function transcribeWithLanguage(audio: Blob, options: Options): Promise<Transcript> {
  const {
    apiKey,
    timeoutMs = 30_000,
    pollIntervalMs = 250,
    fetch: fetchImpl = fetch,
    languages = languagesFromEnv(),
    vocabulary = vocabularyFromEnv(),
  } = options;
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
    if (!response.ok) throw new GladiaError(`Gladia ${step} failed (${response.status}).`, "failed", response.status);
    return (await response.json()) as T;
  }

  const form = new FormData();
  form.append("audio", audio, audio instanceof File && audio.name ? audio.name : "voice.webm");
  const { audio_url } = await call<{ audio_url: string }>("upload", "/upload", { method: "POST", body: form });

  const createJob = (body: Record<string, unknown>) =>
    call<{ id: string }>("job creation", "/pre-recorded", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const tuned = preRecordedBody(audio_url, languages, vocabulary);
  let created: { id: string };
  try {
    created = await createJob(tuned);
  } catch (error) {
    // The options are a bonus (custom vocabulary is a Gladia beta): a refused body is retried once without them,
    // so a change on Gladia's side never costs the traveller their sentence.
    const refused = error instanceof GladiaError && (error.status === 400 || error.status === 422);
    if (!refused || Object.keys(tuned).length === 1) throw error;
    created = await createJob({ audio_url });
  }
  const { id } = created;

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
