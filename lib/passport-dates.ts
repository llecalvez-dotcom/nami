import { z } from "zod";

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const TripDatesSchema = z.object({
  return_date: z.iso.date().nullish(),
  arrival_at: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullish(),
});
export type TripDates = z.infer<typeof TripDatesSchema>;

export function returnReference({ return_date, arrival_at }: TripDates): string | null {
  if (return_date) return return_date;
  if (arrival_at) return addDays(arrival_at.slice(0, 10), 30);
  return null;
}

export function expiryWarning(expiryDate: string, trip: TripDates): string | null {
  if (!z.iso.date().safeParse(expiryDate).success) return null;
  const reference = returnReference(trip);
  if (!reference || expiryDate >= addMonths(reference, 6)) return null;
  const basis = trip.return_date ? `your return on ${reference}` : `${reference} (arrival + 30 days)`;
  return `Your passport expires on ${expiryDate}, less than 6 months after ${basis}. Indonesia requires 6 months of validity: renew it before you travel.`;
}
