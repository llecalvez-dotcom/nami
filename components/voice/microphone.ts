export type MicrophoneResult = { ok: true; stream: MediaStream } | { ok: false; message: string };

type MediaDevicesLike = Pick<MediaDevices, "getUserMedia"> | undefined;

export async function requestMicrophone(mediaDevices: MediaDevicesLike): Promise<MicrophoneResult> {
  if (!mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return { ok: false, message: "Voice input isn't available in this browser. Type instead." };
  }
  try {
    return { ok: true, stream: await mediaDevices.getUserMedia({ audio: true }) };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { ok: false, message: "Microphone access was refused. Type instead." };
    }
    if (name === "NotFoundError") return { ok: false, message: "No microphone found. Type instead." };
    return { ok: false, message: "The microphone couldn't start. Type instead." };
  }
}

export function audioFileName(mimeType: string): string {
  if (mimeType.includes("mp4")) return "voice.mp4";
  if (mimeType.includes("ogg")) return "voice.ogg";
  return "voice.webm";
}
