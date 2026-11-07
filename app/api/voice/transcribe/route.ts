import { GladiaError, transcribeWithGladia } from "@/lib/gladia";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const apiKey = process.env.GLADIA_API_KEY;
  if (!apiKey) return fail("Voice transcription is not configured. Type your trip instead.", 503);

  let audio: FormDataEntryValue | null;
  try {
    audio = (await request.formData()).get("audio");
  } catch {
    return fail("Expected a multipart form with an audio file.", 400);
  }
  if (!(audio instanceof Blob) || audio.size === 0) return fail("No audio received.", 400);
  if (audio.size > MAX_AUDIO_BYTES) return fail("Recording too long.", 413);

  try {
    const text = await transcribeWithGladia(audio, { apiKey });
    return Response.json({ text });
  } catch (error) {
    if (error instanceof GladiaError && error.kind === "timeout") return fail(error.message, 504);
    return fail(error instanceof GladiaError ? error.message : "Transcription failed.", 502);
  }
}
