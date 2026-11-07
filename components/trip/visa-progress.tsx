import { Check } from "lucide-react";
import type { ProgressStep } from "@/lib/trip-progress";
import { cn } from "@/lib/utils";

export function VisaProgress({ steps, compact = false }: { steps: ProgressStep[]; compact?: boolean }) {
  const done = steps.filter((s) => s.state === "done").length;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          Step {Math.min(done + 1, steps.length)} of {steps.length}
        </span>
        <span>{Math.round((done / steps.length) * 100)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className={cn("mt-5", compact ? "space-y-3" : "grid gap-4 sm:grid-cols-5 sm:gap-3")}>
        {steps.map((step, i) => (
          <li key={step.id} className={cn("flex gap-3", !compact && "sm:flex-col sm:gap-2")}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                step.state === "done" && "bg-primary text-primary-foreground",
                step.state === "current" && "bg-accent text-accent-foreground ring-2 ring-primary/40",
                step.state === "todo" && "bg-muted text-muted-foreground",
              )}
            >
              {step.state === "done" ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm font-medium", step.state === "todo" && "text-muted-foreground")}>{step.label}</span>
              <span className="block text-xs text-muted-foreground">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
