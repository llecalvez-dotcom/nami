"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MicButton, VoiceStatusLine } from "@/components/voice/mic-button";
import { useVoiceInput } from "@/components/voice/use-voice-input";

type Props = {
  question: string;
  onValidate: (value: string) => void;
  isValid?: (value: string) => boolean;
  type?: "text" | "email";
  placeholder?: string;
  label: string;
};

export function VoiceAnswer({ question, onValidate, isValid = (v) => v.trim().length > 0, type = "text", placeholder, label }: Props) {
  const [value, setValue] = useState("");
  const voice = useVoiceInput(setValue);
  const { start } = voice;
  const valid = isValid(value);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(question);
    utterance.lang = "en-US";
    utterance.onend = () => void start();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => {
      utterance.onend = null;
      window.speechSynthesis.cancel();
    };
  }, [question, start]);

  return (
    <div className="mt-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onValidate(value.trim());
        }}
      >
        <MicButton voice={voice} className="size-11 rounded-full" />
        <input
          type={type}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="h-11 min-w-0 flex-1 rounded-full bg-muted px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        />
        <Button type="submit" size="lg" className="h-11 rounded-full px-5 shadow-glow disabled:shadow-none" disabled={!valid}>
          Validate
        </Button>
      </form>
      <VoiceStatusLine voice={voice} className="mt-2" />
    </div>
  );
}
