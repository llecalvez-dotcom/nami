import { alpha3ToAlpha2 } from "i18n-iso-countries";

export function nationalityCode(code: string): string {
  const upper = code.toUpperCase();
  return alpha3ToAlpha2(upper) ?? upper;
}

export function normalizeMrz(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[\s'’\-]/g, "<").replace(/<+/g, "<").replace(/^<|<$/g, "");
}

export function mrzCheckDigit(value: string): string {
  const sum = [...value].reduce((total, char, index) => {
    const n = char === "<" ? 0 : /[0-9]/.test(char) ? Number(char) : char.charCodeAt(0) - 55;
    return total + n * [7, 3, 1][index % 3];
  }, 0);
  return String(sum % 10);
}

function dateValue(value: string, birth: boolean, now: Date): string | null {
  if (!/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const year = (birth && yy > now.getUTCFullYear() % 100 ? 1900 : 2000) + yy;
  const iso = `${year}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseMrz(line1: unknown, line2: unknown, now = new Date()) {
  if (typeof line1 !== "string" || typeof line2 !== "string") return null;
  const lines = [line1, line2].map((line) => line.toUpperCase().replace(/\s/g, ""));
  if (lines[0].length < 5 || lines[1].length < 28
    || lines.some((line) => line.length > 44 || !/^[A-Z0-9<]+$/.test(line))) return null;
  const [first, second] = lines.map((line) => line.padEnd(44, "<"));
  if (!first.startsWith("P") || !/^[A-Z<]{3}$/.test(second.slice(10, 13))) return null;
  const [surname, ...given] = first.slice(5).split("<<");
  const birth_date = dateValue(second.slice(13, 19), true, now);
  const expiry_date = dateValue(second.slice(21, 27), false, now);
  const valid = (value: string, digit: string) => mrzCheckDigit(value) === digit;
  return {
    fields: {
      surname: normalizeMrz(surname),
      given_names: normalizeMrz(given.join("<")),
      nationality: nationalityCode(second.slice(10, 13)),
      passport_number: second.slice(0, 9).replace(/<+$/, ""),
      birth_date,
      expiry_date,
    },
    checks: {
      passport_number: valid(second.slice(0, 9), second[9]),
      birth_date: birth_date !== null && valid(second.slice(13, 19), second[19]),
      expiry_date: expiry_date !== null && valid(second.slice(21, 27), second[27]),
      composite: valid(second.slice(0, 10) + second.slice(13, 20) + second.slice(21, 43), second[43]),
    },
  };
}
