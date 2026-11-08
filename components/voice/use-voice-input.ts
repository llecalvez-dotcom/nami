"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioFileName, requestMicrophone } from "@/components/voice/microphone";
import { stopSpeaking } from "@/components/voice/speech";
import { languageToKeep, MIN_WORDS_WHEN_AUTO, setSpokenLanguage } from "@/lib/voice/language";
import { isPhantomTranscript } from "@/lib/voice/phantom";
import { createAutoListenWatcher, rms } from "@/lib/voice/silence";

export const MAX_RECORDING_SECONDS = 20;
// A microphone that opened by itself never keeps the traveller waiting long, even if the room never goes quiet.
const MAX_AUTO_SECONDS = 10;

export type VoiceStatus = "idle" | "recording" | "transcribing";

export type VoiceInput = {
  status: VoiceStatus;
  seconds: number;
  error: string | null;
  // "auto": opened by itself after Nami's sentence, not by a tap (lib/voice/auto-listen.ts).
  start: (mode?: "auto") => Promise<void>;
  stop: () => void;
  toggle: () => void;
};

class NothingHeard extends Error {}

// What each recording did, for the bench (read through DevTools): never a word of what was said.
type VoiceStats = { mode: "auto" | "tap"; peak: number; ended: string; ms?: number; words?: number; failed?: string };
function logVoice(stats: VoiceStats) {
  const log = window as unknown as { namiVoiceLog?: unknown[] };
  log.namiVoiceLog = [...(log.namiVoiceLog ?? []), { ...stats, peak: Number(stats.peak.toFixed(4)) }].slice(-30);
}

// What Nami made of the answer: accept, decline, option, free.
export function logVoiceMeaning(meaning: string) {
  const log = window as unknown as { namiVoiceLog?: unknown[] };
  log.namiVoiceLog = [...(log.namiVoiceLog ?? []), { meaning }].slice(-30);
}

// The language Gladia detected is kept, from a sentence of 3 words or more: Nami answers in it (lib/voice/language.ts).
async function transcribe(blob: Blob, auto: boolean): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, audioFileName(blob.type));
  const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { text?: string; language?: string | null; error?: string };
  if (!response.ok || typeof body.text !== "string") throw new Error(body.error ?? "Transcription failed. Type instead.");
  if (!body.text || isPhantomTranscript(body.text)) throw new NothingHeard("I didn't catch anything. Try again or type instead.");
  setSpokenLanguage(languageToKeep(body.text, body.language, auto ? MIN_WORDS_WHEN_AUTO : undefined));
  return body.text;
}

// Stops the recording after a silence that follows speech, measured on the microphone level by Web Audio.
// onNothing: only for a microphone that opened by itself, when nobody spoke.
function watchSilence(stream: MediaStream, onSilence: () => void, onNothing: (() => void) | undefined, stats: VoiceStats): () => void {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return () => {};
  try {
    const audio = new Context();
    void audio.resume().catch(() => {});
    const analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const watch = createAutoListenWatcher(onNothing ? undefined : Infinity);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const level = rms(samples);
      stats.peak = Math.max(stats.peak, level);
      const verdict = watch(level, performance.now());
      if (verdict !== "listening") stats.ended = verdict;
      if (verdict === "silence") onSilence();
      if (verdict === "nothing") onNothing?.();
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
  const autoRetriedRef = useRef(false);
  const startRef = useRef<(mode?: "auto") => Promise<void>>(async () => {});

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

  const start = useCallback(async (mode?: "auto") => {
    if (recorderRef.current || startingRef.current) return;
    const auto = mode === "auto";
    startingRef.current = true;
    stopSpeaking();
    setError(null);
    const mic = await requestMicrophone(navigator.mediaDevices).finally(() => {
      startingRef.current = false;
    });
    if (!mic.ok) {
      if (!auto) setError(mic.message);
      return;
    }
    if (!mountedRef.current) {
      mic.stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const recorder = new MediaRecorder(mic.stream);
    const chunks: Blob[] = [];
    let nobodySpoke = false;
    const stats: VoiceStats = { mode: auto ? "auto" : "tap", peak: 0, ended: "stopped" };
    const recordingSince = Date.now();
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      mic.stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      stats.ms = Date.now() - recordingSince;
      if (!mountedRef.current) return;
      if (nobodySpoke) {
        logVoice(stats);
        return setStatus("idle");
      }
      setStatus("transcribing");
      try {
        const text = await transcribe(new Blob(chunks, { type: recorder.mimeType }), auto);
        stats.words = text.trim().split(/\s+/).length;
        logVoice(stats);
        autoRetriedRef.current = false;
        if (mountedRef.current) onTranscriptRef.current(text);
      } catch (e) {
        stats.failed = e instanceof NothingHeard ? "nothing heard" : "transcription";
        logVoice(stats);
        // Something was heard but not understood: listens once more by itself, then says so.
        if (mountedRef.current && auto && e instanceof NothingHeard && !autoRetriedRef.current) {
          autoRetriedRef.current = true;
          void startRef.current("auto");
        } else if (mountedRef.current) {
          autoRetriedRef.current = false;
          setError(e instanceof Error ? e.message : "Transcription failed. Type instead.");
        }
      } finally {
        if (mountedRef.current) setStatus("idle");
      }
    };

    recorder.start();
    unwatchRef.current = watchSilence(mic.stream, stop, auto ? () => {
      nobodySpoke = true;
      stop();
    } : undefined, stats);
    setSeconds(0);
    setStatus("recording");
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= (auto ? MAX_AUTO_SECONDS : MAX_RECORDING_SECONDS)) {
        stats.ended = "time limit";
        stop();
      }
    }, 250);
  }, [stop]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

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
