const UNSPLASH = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;

const BY_KEYWORD: [RegExp, string][] = [
  [/bali|indonesia|ubud|denpasar/i, "photo-1537996194471-e657df975ab4"],
  [/paris|france/i, "photo-1502602898657-3e91760cbb34"],
  [/tokyo|osaka|kyoto|japan/i, "photo-1540959733332-eab4deabeeaf"],
  [/london|united kingdom|england|\buk\b/i, "photo-1513635269975-59663e0ac1ad"],
  [/new york|united states|\busa?\b/i, "photo-1496442226666-8d4d0e62e6e9"],
  [/dubai|emirates/i, "photo-1512453979798-5ea266f8880c"],
  [/kenya|tanzania|zanzibar|nairobi|safari/i, "photo-1516026672322-bc52d61a55d5"],
  [/venice|italy|rome|milan/i, "photo-1523906834658-6e24ef2386f9"],
  [/lisbon|portugal|porto/i, "photo-1585208798174-6cedd86e019a"],
  [/maldives|thailand|beach|island|caribbean/i, "photo-1519046904884-53103b34b206"],
];

const BY_ISO2: Record<string, string> = {
  ID: "photo-1518548419970-58e3b4079ab2",
  FR: "photo-1499856871958-5b9627545d1a",
  JP: "photo-1528360983277-13d401cdc186",
  GB: "photo-1513635269975-59663e0ac1ad",
  US: "photo-1496442226666-8d4d0e62e6e9",
  AE: "photo-1512453979798-5ea266f8880c",
  KE: "photo-1516026672322-bc52d61a55d5",
  TZ: "photo-1547471080-7cc2caa01a7e",
  IT: "photo-1523906834658-6e24ef2386f9",
  PT: "photo-1585208798174-6cedd86e019a",
};

const FALLBACK = "photo-1488646953014-85cb44e25828";

export function destinationImage(destination: string | null | undefined, iso2?: string | null): string {
  const hit = destination ? BY_KEYWORD.find(([re]) => re.test(destination)) : undefined;
  return UNSPLASH(hit?.[1] ?? (iso2 ? BY_ISO2[iso2] : undefined) ?? FALLBACK);
}
