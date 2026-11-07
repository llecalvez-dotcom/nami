import type { DocumentExtraction, PassportFields } from "@/lib/contracts";
import { countryName } from "@/lib/countries";

// What the side panel says aloud about the documents it finds and reads. The passport number and the birth date are
// never in these sentences: they are read aloud.

export type FoundDocument = { id: string; name: string; score: number };
export type Reader = "h" | "anthropic";

export function bestFirst<T extends FoundDocument>(documents: readonly T[]): T[] {
  return [...documents].sort((a, b) => b.score - a.score);
}

const PROVIDER: Record<Reader, string> = { h: "H Company", anthropic: "Anthropic" };

export function foundPassportText(document: FoundDocument, reader: Reader): string {
  return `I found your passport on this computer (${document.name}). Shall I read it? It is sent to ${PROVIDER[reader]} to be read, never stored.`;
}

export function foundPhotoText(document: FoundDocument): string {
  return `I also found your ID photo (${document.name}). Shall I use it for the visa?`;
}

export function foundReturnTicketText(document: FoundDocument): string {
  return `I also found a PDF that looks like your return ticket (${document.name}). Shall I give it to the official site? It is required.`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthYear(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : isoDate;
}

export type ReadSummary =
  | { ok: true; fields: PassportFields; text: string }
  | { ok: false; text: string };

// ok: every field read and no disagreement with the MRZ, so a spoken "yes" is enough. Otherwise the traveller checks the fields.
export function readSummary(extraction: DocumentExtraction): ReadSummary {
  const f = extraction.fields;
  const missing = Object.entries(f).filter(([, value]) => !value).map(([key]) => key);
  const mrzProblem = extraction.warnings.find((w) => /MRZ/.test(w));
  if (missing.length > 0 || mrzProblem) {
    const why = missing.length > 0 ? "some fields could not be read" : "the printed fields and the machine-readable line disagree";
    return { ok: false, text: `I read your passport, but ${why}. Please check the fields below, then confirm them.` };
  }
  const fields = f as PassportFields;
  const checked = (extraction.mrz_verified?.length ?? 0) > 0 ? ", and the machine-readable line matches" : "";
  const expiry = extraction.warnings.find((w) => w.startsWith("Your passport expires on "));
  const nationality = countryName(fields.nationality);
  return {
    ok: true,
    fields,
    text: `I read: ${fields.surname} ${fields.given_names}, passport from ${nationality}, valid until ${monthYear(fields.expiry_date)}${checked}.${expiry ? ` ${expiry}` : ""} Is that right?`,
  };
}
