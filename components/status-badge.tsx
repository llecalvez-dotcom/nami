import { SAMPLE_LABEL } from "@/data/sample";
import { cn } from "@/lib/utils";
import type { ItemStatus, ModuleState } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";

const ITEM_STATUS: Record<ItemStatus, { label: string; className: string }> = {
  suggested: { label: "Suggested", className: "border-border bg-muted text-muted-foreground" },
  checked: { label: "Checked", className: "border-primary/20 bg-primary/5 text-primary" },
  pending_approval: { label: "Pending approval", className: "border-attention/30 bg-attention/10 text-[#8a5a24]" },
  confirmed: { label: "Confirmed", className: "border-primary bg-primary text-primary-foreground" },
};

const MODULE_STATE: Record<ModuleState, string> = {
  suggested: "Suggested",
  accepted: "Accepted",
  declined: "Declined",
  soon: "Soon",
  none_needed: "Nothing to do",
  not_supported_yet: "Not supported yet",
};

const pill = "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap";

export function StatusBadge({ status, checkedAt }: { status: ItemStatus; checkedAt?: string | null }) {
  const { label, className } = ITEM_STATUS[status];
  return (
    <span className={cn(pill, className)}>
      {label}
      {status === "checked" && checkedAt ? ` · ${formatDateTime(checkedAt, "Europe/Paris")}` : null}
    </span>
  );
}

export function ModuleStateBadge({ state }: { state: ModuleState | null }) {
  return (
    <span
      className={cn(
        pill,
        state === "accepted" ? "border-primary/20 bg-primary/5 text-primary" : "border-border bg-muted text-muted-foreground",
      )}
    >
      {state ? MODULE_STATE[state] : "Not yet"}
    </span>
  );
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        pill,
        "border-dashed border-attention bg-attention/10 font-mono uppercase tracking-wide text-[#8a5a24]",
        className,
      )}
    >
      {SAMPLE_LABEL}
    </span>
  );
}
