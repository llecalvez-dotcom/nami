"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MicButton, VoiceStatusLine } from "@/components/voice/mic-button";
import { useListenAfterSpeech } from "@/components/voice/speech";
import { useVoiceInput } from "@/components/voice/use-voice-input";
import { spokenEmail } from "@/lib/voice/short-answers";

type Props = {
  itemId: string;
  onValidate: (value: string) => void;
  isValid?: (value: string) => boolean;
  type?: "text" | "email";
  placeholder?: string;
  label: string;
};

// The transcript stays in the field and is sent on "Validate" only: a dictated e-mail must be read first.
export function VoiceAnswer({ itemId, onValidate, isValid = (v) => v.trim().length > 0, type = "text", placeholder, label }: Props) {
  const [value, setValue] = useState("");
  const voice = useVoiceInput((text) => setValue(type === "email" ? spokenEmail(text) : text));
  useListenAfterSpeech(itemId, voice.start);
  const valid = isValid(value);

  return (
    <div className="mt-4">
      <form
        className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 sm:flex"
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
        <Button type="submit" size="lg" className="col-span-2 h-11 rounded-full px-5 shadow-glow disabled:shadow-none sm:col-auto" disabled={!valid}>
          Send answer
        </Button>
      </form>
      <VoiceStatusLine voice={voice} className="mt-2" />
    </div>
  );
}
