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
  home: { label: "Home", color: "#102934", pill: "bg-[#102934] text-[#f4faff]" },
  in_progress: { label: "Visa in progress", color: "#ff7a1a", pill: "bg-[#ff7a1a] text-[#1b1b1b]" },
  ready: { label: "Ready to go", color: "#a5c93a", pill: "bg-[#a5c93a] text-[#1f3a10]" },
  planned: { label: "Planned", color: "#ffda36", pill: "bg-[#ffda36] text-[#38210d]" },
  wish: { label: "Wishlist", color: "#f2a6c8", pill: "bg-[#f2a6c8] text-[#7a1030]" },
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
  return <span className={cn(pill, "label-mono h-7 px-3 font-bold ring-1 ring-black/10", tone, className)}>{label}</span>;
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        pill,
        "border border-dashed border-[#8a3a00] bg-[#fffdf3] font-mono tracking-wide text-[#8a3a00] uppercase",
        className,
      )}
    >
      {SAMPLE_LABEL}
    </span>
  );
}
