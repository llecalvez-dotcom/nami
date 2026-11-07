"use client";

import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConversationItem } from "@/lib/trip-state";

type Handlers = {
  onAnswer: (itemId: string, value: string, label: string) => void;
  onDecide: (itemId: string, accepted: boolean) => void;
};

function AgentLabel({ from }: { from: "nami" | "agent_h" }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      <Sparkles className="size-3.5 text-primary" />
      {from === "agent_h" ? "Agent · asks you" : "Nami"}
    </p>
  );
}

function EmailAnswer({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(value);
      }}
    >
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="you@example.com"
        aria-label="Your e-mail"
        className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      />
      <Button type="submit" size="lg" className="h-10 rounded-lg px-4" disabled={!valid}>
        Validate
      </Button>
    </form>
  );
}

function QuestionCard({ item, onAnswer }: { item: Extract<ConversationItem, { kind: "question" }> } & Pick<Handlers, "onAnswer">) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5",
        item.answer === null && "border-primary/30 shadow-[0_8px_24px_-16px_rgba(33,77,69,0.45)]",
      )}
    >
      <AgentLabel from={item.from} />
      <p className="font-heading text-2xl leading-tight">{item.question}</p>
      {item.answer !== null ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
          <Check className="size-3.5 text-primary" /> {item.answer}
        </p>
      ) : item.input === "email" ? (
        <EmailAnswer onSubmit={(value) => onAnswer(item.id, value, value)} />
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.options.map((option) => (
            <Button
              key={option.value}
              variant="outline"
              size="lg"
              className="h-10 rounded-full px-4"
              onClick={() => onAnswer(item.id, option.value, option.label)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({ item, onDecide }: { item: Extract<ConversationItem, { kind: "proposal" }> } & Pick<Handlers, "onDecide">) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5",
        item.decision === null && "border-primary/30 shadow-[0_8px_24px_-16px_rgba(33,77,69,0.45)]",
      )}
    >
      <AgentLabel from="nami" />
      <p className="font-heading text-2xl leading-tight">{item.text}</p>
      {item.decision === null ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="lg" className="h-10 rounded-full px-5" onClick={() => onDecide(item.id, true)}>
            {item.accept_label}
          </Button>
          <Button variant="ghost" size="lg" className="h-10 rounded-full px-4" onClick={() => onDecide(item.id, false)}>
            {item.decline_label}
          </Button>
        </div>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
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
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-5 py-3.5 text-primary-foreground">
              <p className="text-[15px] leading-relaxed">“{item.text}”</p>
            </div>
          ) : item.kind === "agent" ? (
            <div className="max-w-[90%] px-1">
              <AgentLabel from="nami" />
              <p className="text-[15px] leading-relaxed">{item.text}</p>
            </div>
          ) : item.kind === "question" ? (
            <QuestionCard item={item} onAnswer={handlers.onAnswer} />
          ) : (
            <ProposalCard item={item} onDecide={handlers.onDecide} />
          )}
        </li>
      ))}
    </ol>
  );
}
