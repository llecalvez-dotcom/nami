import { describe, expect, it, vi } from "vitest";
import { mrzCheckDigit, nationalityCode, normalizeMrz, parseMrz } from "@/lib/mrz";
import { extractPassport, toExtraction } from "@/lib/passport";
import { expiryWarning } from "@/lib/passport-dates";

const ICAO_FIRST = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const ICAO_SECOND = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
const NOW = new Date("2026-11-07T00:00:00Z");

// Generated fictitious French specimen, not a real document.
const printed = {
  surname: "MARTIN",
  given_names: "Camille Jeanne",
  nationality: "FR",
  passport_number: "24AZ12345",
  birth_date: "1990-04-12",
  issue_date: "2020-02-03",
  expiry_date: "2030-02-02",
};
const first = "P<FRAMARTIN<<CAMILLE<JEANNE".padEnd(44, "<");
function secondLine(number = printed.passport_number, birth = "900412", expiry = "300202") {
  const numberPart = number + mrzCheckDigit(number);
  const birthPart = birth + mrzCheckDigit(birth);
  const expiryPart = expiry + mrzCheckDigit(expiry);
  const optionalPart = "<".repeat(14) + "0";
  return numberPart + "FRA" + birthPart + "F" + expiryPart + optionalPart
    + mrzCheckDigit(numberPart + birthPart + expiryPart + optionalPart);
}
const model = {
  ...printed,
  mrz_line1: first,
  mrz_line2: secondLine(),
  confidence: Object.fromEntries(Object.keys(printed).map((key) => [key, 0.9])),
};
const extract = (overrides = {}) => toExtraction(JSON.stringify({ ...model, ...overrides }), {});

describe("TD3 MRZ", () => {
  it("validates all four ICAO specimen check digits and decodes its fields", () => {
    const result = parseMrz(ICAO_FIRST, ICAO_SECOND, NOW);
    expect(result?.checks).toEqual({ passport_number: true, birth_date: true, expiry_date: true, composite: true });
    expect(result?.fields).toEqual({
      surname: "ERIKSSON", given_names: "ANNA<MARIA", nationality: "UTO",
      passport_number: "L898902C3", birth_date: "1974-08-12", expiry_date: "2012-04-15",
    });
  });

  it("tolerates lowercase, whitespace and missing trailing fillers", () => {
    expect(parseMrz(first.toLowerCase().replace(/<+$/, "") + " ", secondLine().toLowerCase(), NOW)?.checks.composite).toBe(true);
  });

  it("uses the requested birth-century pivot and 20xx expiry", () => {
    expect(parseMrz(first, secondLine(undefined, "270101", "990101"), NOW)?.fields).toMatchObject({
      birth_date: "1927-01-01", expiry_date: "2099-01-01",
    });
    expect(parseMrz(first, secondLine(undefined, "260101"), NOW)?.fields.birth_date).toBe("2026-01-01");
  });

  it("keeps unknown nationality codes unknown and normalizes names", () => {
    expect(nationalityCode("CAN")).toBe("CA");
    expect(nationalityCode("UTO")).toBe("UTO");
    expect(normalizeMrz("Éléonore D’Arcy-Smith")).toBe("ELEONORE<D<ARCY<SMITH");
  });

  it("rejects missing, malformed and oversized MRZ input", () => {
    for (const line of [null, "", "not an MRZ!", first + "<"]) expect(parseMrz(line, secondLine())).toBeNull();
  });

  it("detects corrupted individual and composite check digits", () => {
    const line = secondLine();
    for (const [position, field] of [[9, "passport_number"], [19, "birth_date"], [27, "expiry_date"], [43, "composite"]] as const) {
      const corrupted = line.slice(0, position) + (line[position] === "0" ? "1" : "0") + line.slice(position + 1);
      expect(parseMrz(first, corrupted, NOW)?.checks[field]).toBe(false);
    }
    expect(parseMrz(first, secondLine(undefined, "900231"), NOW)?.checks.birth_date).toBe(false);
  });
});

describe("MRZ cross-check", () => {
  it("verifies six matching fields, raises checked-digit confidence and never returns MRZ lines", () => {
    const result = extract();
    expect(result.mrz_verified).toHaveLength(6);
    expect(result.mrz_verified).not.toContain("issue_date");
    expect(result.confidence_per_field).toMatchObject({ passport_number: 1, birth_date: 1, expiry_date: 1, issue_date: 0.9 });
    expect(result.warnings).toEqual([]);
    expect(result).not.toHaveProperty("mrz_line1");
    expect(result).not.toHaveProperty("mrz_line2");
  });

  it("flags a printed Z read as 2 without replacing it", () => {
    const result = extract({ passport_number: "24A212345" });
    expect(result.fields.passport_number).toBe("24A212345");
    expect(result.confidence_per_field.passport_number).toBe(0.3);
    expect(result.mrz_verified).not.toContain("passport_number");
    expect(result.warnings).toContainEqual(expect.stringContaining("Passport number:"));
  });

  it.each(["surname", "given_names", "nationality", "birth_date", "expiry_date"] as const)(
    "flags mismatched %s while preserving the printed value",
    (key) => {
      const value = key.includes("date") ? "2001-01-01" : key === "nationality" ? "BE" : "OTHER";
      const result = extract({ [key]: value });
      expect(result.fields[key]).toBe(value);
      expect(result.confidence_per_field[key]).toBe(0.3);
      expect(result.mrz_verified).not.toContain(key);
      expect(result.warnings).toHaveLength(1);
    },
  );

  it("downgrades a matching value with an invalid check digit", () => {
    const line = secondLine();
    const result = extract({ mrz_line2: line.slice(0, 9) + (line[9] === "0" ? "1" : "0") + line.slice(10) });
    expect(result.fields.passport_number).toBe(printed.passport_number);
    expect(result.confidence_per_field.passport_number).toBe(0.3);
    expect(result.warnings).toContainEqual(expect.stringContaining("composite"));
  });

  // Seen on 2026-11-07 with a real French passport: compound surname printed on the page but read without its particle.
  it("takes the MRZ surname when the printed one only misses a particle of it", () => {
    const result = extract({ surname: "BERGE", mrz_line1: "P<FRALE<BERGE<<CAMILLE<JEANNE".padEnd(44, "<") });
    expect(result.fields.surname).toBe("LE BERGE");
    expect(result.mrz_verified).toContain("surname");
    expect(result.warnings).toEqual([]);
  });

  it("still flags a surname that is not part of the MRZ surname", () => {
    const result = extract({ surname: "DURAND", mrz_line1: "P<FRALE<BERGE<<CAMILLE<JEANNE".padEnd(44, "<") });
    expect(result.fields.surname).toBe("DURAND");
    expect(result.warnings).toContainEqual(expect.stringContaining("Surname:"));
  });

  // Seen on 2026-11-07: every individual check passes, the composite fails because the model miscounts the < fillers.
  it.each([-3, -1, 1, 2])("realigns line 2 when the model miscounts the fillers by %i", (delta) => {
    const line = secondLine();
    const fillers = 14 + delta;
    const miscounted = line.slice(0, 28) + "<".repeat(fillers) + line.slice(42);
    const result = extract({ mrz_line2: miscounted });
    expect(result.warnings).toEqual([]);
    expect(result.mrz_verified).toHaveLength(6);
  });

  it("keeps a real composite error once realigned", () => {
    const line = secondLine();
    const wrong = line.slice(0, 43) + (line[43] === "0" ? "1" : "0");
    expect(extract({ mrz_line2: wrong }).warnings).toContainEqual(expect.stringContaining("composite"));
  });

  it("normalizes accent and name separators before comparison", () => {
    expect(extract({ given_names: "Cámille-Jeanne" }).mrz_verified).toContain("given_names");
    // French passports print the given names separated by commas; the model copies them or not, run to run.
    expect(extract({ given_names: "Camille, Jeanne" }).mrz_verified).toContain("given_names");
    expect(extract({ given_names: "CAMILLE, JEANNE." }).warnings).toEqual([]);
  });

  it.each([null, "not an MRZ"])("leaves confidence unchanged when MRZ is unavailable: %s", (mrz_line1) => {
    const result = extract({ mrz_line1 });
    expect(result.confidence_per_field.passport_number).toBe(0.9);
    expect(result.warnings).toEqual(["The MRZ could not be checked: review the printed fields."]);
    expect(result.mrz_verified).toEqual([]);
  });
});

describe("live expiry date logic", () => {
  it("updates from a short validity date to a valid date and clears for empty or invalid input", () => {
    const trip = { return_date: "2026-11-24" };
    expect(expiryWarning("2027-03-01", trip)).toContain("less than 6 months");
    for (const value of ["2027-05-24", "", "not a date", "2027-02-30"]) expect(expiryWarning(value, trip)).toBeNull();
  });

  it("clamps the six-month threshold to the last day of the month", () => {
    expect(expiryWarning("2027-02-28", { return_date: "2026-08-31" })).toBeNull();
  });
});

describe("nationalityCode", () => {
  it("maps the German MRZ code D<< to DE", () => {
    expect(nationalityCode("D<<")).toBe("DE");
    expect(nationalityCode("FRA")).toBe("FR");
    expect(nationalityCode("FR<")).toBe("FR<");
  });
});

describe("second reading when the MRZ does not confirm the first", () => {
  const IMAGE = { base64: "aGVsbG8=", mimeType: "image/jpeg" as const };
  const reading = (overrides = {}) => JSON.stringify({ ...model, ...overrides });

  it("reads again and keeps the reading the MRZ confirms", async () => {
    const read = vi.fn().mockResolvedValueOnce(reading({ surname: "OTHER" })).mockResolvedValueOnce(reading());
    const result = await extractPassport(IMAGE, {}, { name: "h", read });
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.warnings).toEqual([]);
    expect(result.mrz_verified).toHaveLength(6);
  });

  it("reads once when the MRZ confirms the first reading", async () => {
    const read = vi.fn().mockResolvedValue(reading());
    await extractPassport(IMAGE, {}, { name: "h", read });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps the first reading when the second fails or is not better", async () => {
    const failing = vi.fn().mockResolvedValueOnce(reading({ surname: "OTHER" })).mockRejectedValueOnce(new Error("timeout"));
    expect((await extractPassport(IMAGE, {}, { name: "h", read: failing })).fields.surname).toBe("OTHER");
    const worse = vi.fn().mockResolvedValueOnce(reading({ surname: "OTHER" })).mockResolvedValueOnce(reading({ mrz_line1: null }));
    expect((await extractPassport(IMAGE, {}, { name: "h", read: worse })).fields.surname).toBe("OTHER");
  });

  it("stores the given names without the commas of the printed page", async () => {
    const read = vi.fn().mockResolvedValue(reading({ given_names: "Camille, Jeanne" }));
    expect((await extractPassport(IMAGE, {}, { name: "h", read })).fields.given_names).toBe("Camille Jeanne");
  });
});
