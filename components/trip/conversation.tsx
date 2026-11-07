"use client";

import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceAnswer } from "@/components/voice/voice-answer";
import { cn } from "@/lib/utils";
import type { ConversationItem } from "@/lib/trip-state";

type Handlers = {
  onAnswer: (itemId: string, value: string, label: string) => void;
  onAnswerAgent: (itemId: string, value: string) => void;
  onAnswerText: (itemId: string, text: string) => Promise<void>;
  onDecide: (itemId: string, accepted: boolean) => void;
};

function AgentLabel({ from }: { from: "nami" | "agent_h" }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full text-[11px] font-bold",
          from === "agent_h" ? "bg-foreground text-background" : "bg-primary text-primary-foreground",
        )}
      >
        {from === "agent_h" ? <Sparkles className="size-3" /> : "n"}
      </span>
      {from === "agent_h" ? "Agent asks you" : "Nami"}
    </p>
  );
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function TextAnswer({ onSubmit }: { onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const text = value.trim();
        if (!text || busy) return;
        setBusy(true);
        setError(null);
        try {
          await onSubmit(text);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type your answer"
          aria-label="Your answer"
          className="h-11 min-w-0 flex-1 rounded-full bg-muted px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        />
        <Button type="submit" size="lg" className="h-11 rounded-full px-5 shadow-glow disabled:shadow-none" disabled={!value.trim() || busy}>
          {busy ? "Reading…" : "Send"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-attention-foreground">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function QuestionCard({
  item,
  onAnswer,
  onAnswerText,
}: { item: Extract<ConversationItem, { kind: "question" }> } & Pick<Handlers, "onAnswer" | "onAnswerText">) {
  return (
    <div
      className={cn(
        "rounded-[28px] bg-card p-6 shadow-soft",
        item.answer === null && "ring-2 ring-primary/25",
      )}
    >
      <AgentLabel from={item.from} />
      <p className="text-xl leading-snug font-semibold tracking-tight">{item.question}</p>
      {item.answer !== null ? (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground">
          <Check className="size-3.5 text-primary" /> {item.answer}
        </p>
      ) : item.input === "email" ? (
        <VoiceAnswer
          question={item.question}
          type="email"
          isValid={isEmail}
          placeholder="you@example.com"
          label="Your e-mail"
          onValidate={(value) => onAnswer(item.id, value, value)}
        />
      ) : (
        <>
          {item.options.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.options.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  size="lg"
                  className="h-10 rounded-full border-border px-4 hover:border-primary hover:bg-accent hover:text-accent-foreground"
                  onClick={() => onAnswer(item.id, option.value, option.label)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
          {item.input === "text" ? <TextAnswer onSubmit={(text) => onAnswerText(item.id, text)} /> : null}
        </>
      )}
    </div>
  );
}

const looksLikeEmail = (field: string, question: string) => /e-?mail/i.test(field) || /e-?mail/i.test(question);

// ask_user from the H agent: read aloud, answered by voice or text, sent on "Validate".
function AgentQuestionCard({
  item,
  onAnswerAgent,
}: { item: Extract<ConversationItem, { kind: "agent_question" }> } & Pick<Handlers, "onAnswerAgent">) {
  const email = looksLikeEmail(item.field, item.question);
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5",
        item.answer === null && "border-primary/30 shadow-[0_8px_24px_-16px_rgba(33,77,69,0.45)]",
      )}
    >
      <AgentLabel from="agent_h" />
      <p className="font-heading text-2xl leading-tight">{item.question}</p>
      {item.answer !== null ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
          <Check className="size-3.5 text-primary" /> {item.answer}
        </p>
      ) : (
        <VoiceAnswer
          question={item.question}
          type={email ? "email" : "text"}
          isValid={email ? isEmail : undefined}
          placeholder={email ? "you@example.com" : "Your answer"}
          label="Your answer to the agent"
          onValidate={(value) => onAnswerAgent(item.id, value)}
        />
      )}
    </div>
  );
}

function ProposalCard({ item, onDecide }: { item: Extract<ConversationItem, { kind: "proposal" }> } & Pick<Handlers, "onDecide">) {
  return (
    <div
      className={cn(
        "rounded-[28px] bg-card p-6 shadow-soft",
        item.decision === null && "ring-2 ring-primary/25",
      )}
    >
      <AgentLabel from="nami" />
      <p className="text-xl leading-snug font-semibold tracking-tight">{item.text}</p>
      {item.decision === null ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="lg" className="h-11 rounded-full px-6 shadow-glow" onClick={() => onDecide(item.id, true)}>
            {item.accept_label}
          </Button>
          <Button variant="ghost" size="lg" className="h-11 rounded-full px-5 text-muted-foreground" onClick={() => onDecide(item.id, false)}>
            {item.decline_label}
          </Button>
        </div>
      ) : (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground">
          {item.decision === "accepted" ? <Check className="size-3.5 text-primary" /> : <X className="size-3.5" />}
          {item.decision === "accepted" ? item.accept_label : item.decline_label}
        </p>
      )}
    </div>
  );
}

export function Conversation({ items, ...handlers }: { items: ConversationItem[] } & Handlers) {
  return (
    <ol className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          {item.kind === "user" ? (
            <div className="ml-auto max-w-[85%] rounded-[24px] rounded-br-lg bg-primary px-5 py-3.5 text-primary-foreground shadow-glow">
              <p className="text-[15px] leading-relaxed">“{item.text}”</p>
            </div>
          ) : item.kind === "agent" ? (
            <div className="max-w-[90%] px-2">
              <AgentLabel from="nami" />
              <p className="text-[15px] leading-relaxed">{item.text}</p>
              {item.list && item.list.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {item.list.map((entry) => (
                    <li key={entry} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                      {entry}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : item.kind === "question" ? (
            <QuestionCard item={item} onAnswer={handlers.onAnswer} onAnswerText={handlers.onAnswerText} />
          ) : item.kind === "agent_question" ? (
            <AgentQuestionCard item={item} onAnswerAgent={handlers.onAnswerAgent} />
          ) : (
            <ProposalCard item={item} onDecide={handlers.onDecide} />
          )}
        </li>
      ))}
    </ol>
  );
}
