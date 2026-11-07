"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioFileName, requestMicrophone } from "@/components/voice/microphone";
import { stopSpeaking } from "@/components/voice/speech";
import { setSpokenLanguage } from "@/lib/voice/language";
import { createSilenceDetector, rms } from "@/lib/voice/silence";

export const MAX_RECORDING_SECONDS = 20;

export type VoiceStatus = "idle" | "recording" | "transcribing";

export type VoiceInput = {
  status: VoiceStatus;
  seconds: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
};

// The language Gladia detected is kept: Nami answers in it (lib/voice/language.ts).
async function transcribe(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, audioFileName(blob.type));
  const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { text?: string; language?: string | null; error?: string };
  if (!response.ok || typeof body.text !== "string") throw new Error(body.error ?? "Transcription failed. Type instead.");
  if (!body.text) throw new Error("I didn't catch anything. Try again or type instead.");
  setSpokenLanguage(body.language);
  return body.text;
}

// Stops the recording after a silence that follows speech, measured on the microphone level by Web Audio.
function watchSilence(stream: MediaStream, onSilence: () => void): () => void {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return () => {};
  try {
    const audio = new Context();
    void audio.resume().catch(() => {});
    const analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const silent = createSilenceDetector();
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      if (silent(rms(samples), performance.now())) onSilence();
    }, 100);
    return () => {
      clearInterval(timer);
      void audio.close().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

export function useVoiceInput(onTranscript: (text: string) => void): VoiceInput {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unwatchRef = useRef<(() => void) | null>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    unwatchRef.current?.();
    unwatchRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return;
    startingRef.current = true;
    stopSpeaking();
    setError(null);
    const mic = await requestMicrophone(navigator.mediaDevices).finally(() => {
      startingRef.current = false;
    });
    if (!mic.ok) {
      setError(mic.message);
      return;
    }
    if (!mountedRef.current) {
      mic.stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const recorder = new MediaRecorder(mic.stream);
    const chunks: Blob[] = [];
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      mic.stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      if (!mountedRef.current) return;
      setStatus("transcribing");
      try {
        const text = await transcribe(new Blob(chunks, { type: recorder.mimeType }));
        if (mountedRef.current) onTranscriptRef.current(text);
      } catch (e) {
        if (mountedRef.current) setError(e instanceof Error ? e.message : "Transcription failed. Type instead.");
      } finally {
        if (mountedRef.current) setStatus("idle");
      }
    };

    recorder.start();
    unwatchRef.current = watchSilence(mic.stream, stop);
    setSeconds(0);
    setStatus("recording");
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) stop();
    }, 250);
  }, [stop]);

  const toggle = useCallback(() => {
    if (status === "recording") stop();
    else if (status === "idle") void start();
  }, [status, start, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  return { status, seconds, error, start, stop, toggle };
}
