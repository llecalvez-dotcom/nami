import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nationalityCode, parseMrz } from "@/lib/mrz";
import { expiryWarning, extractPassport, hReader } from "@/lib/passport";

// Ticket 0: the synthetic SPECIMEN passports of fixtures/test-documents (Samy's scripts/make-test-documents.py) read
// through Nami's own path: the MRZ check always, the H vision model when HAI_API_KEY is present.
type Document = {
  case: string;
  passport: string;
  photo?: string;
  expected: { surname: string; given_names: string; nationality: string; passport_number: string; sex: string; birth_date: string; expiry_date: string };
  mrz: [string, string];
};

const DIR = join(process.cwd(), "fixtures", "test-documents");
const MANIFEST = join(DIR, "manifest.json");
const documents: Document[] = existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Document[]) : [];
const rows = documents.map((d) => [d.case, d] as const);
// The bench trip: Bali from mid November, back on December 3. Only the "expiring too soon" case must trip the 6-month rule.
const TRIP = { arrival_at: "2026-11-16T14:30:00+08:00", return_date: "2026-12-03" };
const TODAY = new Date("2026-11-08");
const expectsWarning = (d: Document) => /too soon|expir/i.test(d.case);
const withKey = Boolean(process.env.HAI_API_KEY);

describe("fixtures/test-documents", () => {
  it("has its README, three SPECIMEN documents, and the generator", () => {
    expect(existsSync(join(DIR, "README.md"))).toBe(true);
    expect(existsSync(join(process.cwd(), "scripts", "make-test-documents.py"))).toBe(true);
    expect(documents).toHaveLength(3);
    for (const document of documents) expect(document.expected.passport_number).toMatch(/^TST/);
    expect(documents.some((d) => d.expected.nationality === "FRA")).toBe(true);
    expect(documents.some((d) => d.expected.nationality === "TCD")).toBe(true);
    expect(documents.filter(expectsWarning)).toHaveLength(1);
  });

  it.each(rows)("%s: the expected fields are a valid passport, its MRZ checks out, its files exist", (_, document) => {
    expect(document.expected.birth_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(document.expected.expiry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const read = parseMrz(document.mrz[0], document.mrz[1], TODAY);
    expect(read).not.toBeNull();
    expect(read!.checks).toEqual({ passport_number: true, birth_date: true, expiry_date: true, composite: true });
    for (const key of ["surname", "given_names", "passport_number", "birth_date", "expiry_date"] as const) {
      expect(read!.fields[key], key).toBe(document.expected[key]);
    }
    expect(read!.fields.nationality).toBe(nationalityCode(document.expected.nationality));
    expect(existsSync(join(DIR, document.passport))).toBe(true);
    if (document.photo) expect(existsSync(join(DIR, document.photo))).toBe(true);
  });

  it.each(rows)("%s: the 6-month rule warns exactly when it should", (_, document) => {
    const warning = expiryWarning(document.expected.expiry_date, TRIP);
    expect(warning !== null).toBe(expectsWarning(document));
  });

  it.skipIf(!withKey).each(rows)("%s: the H vision model reads the image like the manifest", async (_, document) => {
    const bytes = readFileSync(join(DIR, document.passport));
    const extraction = await extractPassport(
      { base64: bytes.toString("base64"), mimeType: "image/jpeg" },
      TRIP,
      hReader(process.env.HAI_API_KEY!),
    );
    for (const key of ["surname", "given_names", "passport_number", "birth_date", "expiry_date"] as const) {
      expect(extraction.fields[key], key).toBe(document.expected[key]);
    }
    expect(extraction.fields.nationality).toBe(nationalityCode(document.expected.nationality));
    expect(extraction.mrz_verified ?? []).toEqual(expect.arrayContaining(["passport_number", "birth_date", "expiry_date"]));
  }, 90_000);
});
