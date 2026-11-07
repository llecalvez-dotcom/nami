const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const EXCLUDED = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"]);

const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

export function countryName(iso2: string): string {
  return regionNames.of(iso2) ?? iso2;
}

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const COUNTRIES: readonly { iso2: string; name: string }[] = [...LETTERS]
  .flatMap((a) => [...LETTERS].map((b) => a + b))
  .filter((code) => !EXCLUDED.has(code))
  .flatMap((iso2) => {
    const name = regionNames.of(iso2);
    return name && name !== iso2 ? [{ iso2, name }] : [];
  })
  .sort((x, y) => x.name.localeCompare(y.name));

const ALIASES: Record<string, string> = { usa: "US", uk: "GB", "united states of america": "US", england: "GB", bali: "ID" };

export function countryFromName(input: string): string | null {
  const wanted = normalize(input);
  if (!wanted) return null;
  if (ALIASES[wanted]) return ALIASES[wanted];
  if (/^[a-z]{2}$/.test(wanted)) {
    const code = wanted.toUpperCase();
    return COUNTRIES.some((c) => c.iso2 === code) ? code : null;
  }
  const exact = COUNTRIES.find((c) => normalize(c.name) === wanted);
  if (exact) return exact.iso2;
  const partial = COUNTRIES.filter((c) => normalize(c.name).startsWith(wanted));
  return partial.length === 1 ? partial[0].iso2 : null;
}
