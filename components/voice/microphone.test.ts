import { afterEach, describe, expect, it, vi } from "vitest";
import { audioFileName, requestMicrophone } from "@/components/voice/microphone";

const refused = (name: string) => ({ getUserMedia: vi.fn(async () => Promise.reject(new DOMException("denied", name))) });

describe("requestMicrophone", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the stream when the browser grants the microphone", async () => {
    vi.stubGlobal("MediaRecorder", class {});
    const stream = {} as MediaStream;
    const result = await requestMicrophone({ getUserMedia: vi.fn(async () => stream) });
    expect(result).toEqual({ ok: true, stream });
  });

  it("tells the user to type when the browser refuses the microphone", async () => {
    vi.stubGlobal("MediaRecorder", class {});
    await expect(requestMicrophone(refused("NotAllowedError"))).resolves.toEqual({
      ok: false,
      message: "Microphone access was refused. Type instead.",
    });
    await expect(requestMicrophone(refused("NotFoundError"))).resolves.toMatchObject({ ok: false });
  });

  it("degrades without mediaDevices or MediaRecorder", async () => {
    await expect(requestMicrophone(undefined)).resolves.toMatchObject({ ok: false });
    await expect(requestMicrophone({ getUserMedia: vi.fn() })).resolves.toMatchObject({ ok: false });
  });
});

describe("audioFileName", () => {
  it("matches the recorder format", () => {
    expect(audioFileName("audio/webm;codecs=opus")).toBe("voice.webm");
    expect(audioFileName("audio/mp4")).toBe("voice.mp4");
    expect(audioFileName("")).toBe("voice.webm");
  });
});
