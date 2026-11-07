import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CountryStatusPill, SampleBadge } from "@/components/status-badge";
import type { TripRequestDraft } from "@/lib/contracts";
import { destinationImage } from "@/lib/destination-images";
import { formatDate } from "@/lib/format";
import type { TripStatus } from "@/lib/trip-progress";
import { cn } from "@/lib/utils";

export type TripCardData = { id: string; sample: boolean; request: TripRequestDraft; status: TripStatus };

export function TripCard({ trip, className }: { trip: TripCardData; className?: string }) {
  const { request } = trip;
  const title = request.destination ?? request.raw_text;
  return (
    <Link
      href={`/trip/${trip.id}`}
      className={cn(
        "group flex flex-col rounded-[28px] bg-card p-3 shadow-soft transition-transform duration-300 hover:-translate-y-1",
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-muted">
        <Image
          src={destinationImage(request.destination, request.country_iso2)}
          alt={title}
          fill
          sizes="(min-width: 768px) 320px, 80vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          <CountryStatusPill status={trip.status} className="shadow-soft" />
        </div>
        {trip.sample ? <SampleBadge className="absolute top-3 right-3 bg-card/90" /> : null}
      </div>
      <div className="px-3 pt-5 pb-3">
        <p className="truncate text-[28px] leading-none font-semibold tracking-tight">{title}</p>
        <p className="mt-4 flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground">
          {request.origin_country ?? "?"}
          <span className="h-px flex-1 bg-border" aria-hidden />
          <span aria-hidden>→</span>
          <span className="h-px flex-1 bg-border" aria-hidden />
          {request.country_iso2 ?? "?"}
        </p>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/70 px-3 pt-4 pb-2">
        <div className="space-y-1.5 text-[15px] font-medium">
          <p className="flex items-center gap-2">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            {request.departure_date ? formatDate(request.departure_date) : "Dates to confirm"}
          </p>
          {request.return_date ? (
            <p className="flex items-center gap-2">
              <ChevronLeft className="size-3.5 text-muted-foreground" />
              {formatDate(request.return_date)}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          Details
        </span>
      </div>
    </Link>
  );
}
