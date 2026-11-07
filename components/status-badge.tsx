import { SAMPLE_LABEL } from "@/data/sample";
import { cn } from "@/lib/utils";
import type { ItemStatus, ModuleState } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import type { CountryStatus } from "@/lib/trip-progress";

const ITEM_STATUS: Record<ItemStatus, { label: string; className: string }> = {
  suggested: { label: "Suggested", className: "bg-muted text-muted-foreground" },
  checked: { label: "Checked", className: "bg-accent text-accent-foreground" },
  pending_approval: { label: "Pending approval", className: "bg-attention/12 text-attention-foreground" },
  confirmed: { label: "Confirmed", className: "bg-success/12 text-success" },
};

const MODULE_STATE: Record<ModuleState, string> = {
  suggested: "Suggested",
  accepted: "Accepted",
  declined: "Declined",
  soon: "Soon",
  none_needed: "Nothing to do",
  not_supported_yet: "Not supported yet",
};

export const COUNTRY_STATUS: Record<CountryStatus, { label: string; color: string; pill: string }> = {
  home: { label: "Home", color: "#151a33", pill: "bg-foreground text-background" },
  in_progress: { label: "Visa in progress", color: "#5b3df5", pill: "bg-primary text-primary-foreground" },
  ready: { label: "Ready to go", color: "#12a87a", pill: "bg-success text-white" },
  planned: { label: "Planned", color: "#9d8cff", pill: "bg-accent text-accent-foreground" },
  wish: { label: "Wishlist", color: "#f2a65a", pill: "bg-attention/15 text-attention-foreground" },
};

const pill = "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap";

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
    <span className={cn(pill, state === "accepted" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
      {state ? MODULE_STATE[state] : "Not yet"}
    </span>
  );
}

export function CountryStatusPill({ status, className }: { status: CountryStatus; className?: string }) {
  const { label, pill: tone } = COUNTRY_STATUS[status];
  return <span className={cn(pill, "h-7 px-3", tone, className)}>{label}</span>;
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        pill,
        "border border-dashed border-attention bg-attention/10 font-mono tracking-wide text-attention-foreground uppercase",
        className,
      )}
    >
      {SAMPLE_LABEL}
    </span>
  );
}
