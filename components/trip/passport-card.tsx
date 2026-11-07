"use client";

import { useState } from "react";
import { Camera, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocumentExtraction, PassportFieldKey } from "@/lib/contracts";

const FIELDS: { key: PassportFieldKey; label: string; placeholder: string }[] = [
  { key: "surname", label: "Surname", placeholder: "MARTIN" },
  { key: "given_names", label: "Given names", placeholder: "Camille" },
  { key: "nationality", label: "Nationality", placeholder: "FR" },
  { key: "birth_date", label: "Date of birth", placeholder: "YYYY-MM-DD" },
  { key: "passport_number", label: "Passport number", placeholder: "12AB34567" },
  { key: "issue_date", label: "Date of issue", placeholder: "YYYY-MM-DD" },
  { key: "expiry_date", label: "Expiry date", placeholder: "YYYY-MM-DD" },
];
const MAX_BYTES = 5 * 1024 * 1024;
type Values = Record<PassportFieldKey, string>;
const EMPTY = Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Values;

// Demo mode (?demo=1): only the last 2 characters of the number, no birth date on screen.
export function maskField(key: PassportFieldKey, value: string): string {
  if (!value) return "";
  if (key === "passport_number") return `${"•".repeat(Math.max(0, value.length - 2))}${value.slice(-2)}`;
  if (key === "birth_date") return "Hidden in demo";
  return value;
}

const SENSITIVE: PassportFieldKey[] = ["passport_number", "birth_date"];

// The photo and the fields stay in this component's memory: never stored in the browser nor on the server.
export function PassportCard({ demo, returnDate, arrivalAt }: { demo: boolean; returnDate: string | null; arrivalAt: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const upload = async (file: File) => {
    setError(null);
    setConfirmed(false);
    if (!["image/jpeg", "image/png"].includes(file.type)) return setError("Send a JPEG or PNG photo.");
    if (file.size > MAX_BYTES) return setError("Photo too large (5 MB max).");
    const body = new FormData();
    body.set("image", file);
    if (returnDate) body.set("return_date", returnDate);
    if (arrivalAt) body.set("arrival_at", arrivalAt);
    setBusy(true);
    try {
      const response = await fetch("/api/documents/extract", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "The passport could not be read.");
      const result = json as DocumentExtraction;
      setExtraction(result);
      setValues(Object.fromEntries(FIELDS.map((f) => [f.key, result.fields[f.key] ?? ""])) as Values);
    } catch (e) {
      setError(`${(e as Error).message} You can type the fields instead.`);
      setExtraction(null);
      setValues((v) => v ?? EMPTY);
    } finally {
      setBusy(false);
    }
  };

  const complete = values !== null && FIELDS.every((f) => values[f.key].trim());

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-heading text-2xl leading-tight">Send me a photo of your passport</p>
        {confirmed ? (
          <span className="inline-flex items-center gap-1 text-sm text-primary">
            <Check className="size-4" /> Confirmed
          </span>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        The identity page, sharp and flat. It is read in memory and never stored.
      </p>
      <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground has-[:disabled]:opacity-50">
        <Camera className="size-4" /> {busy ? "Reading…" : values ? "Send another photo" : "Choose a photo"}
        <input
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      {values ? null : (
        <Button type="button" variant="ghost" size="sm" className="ml-2 rounded-full" onClick={() => setValues(EMPTY)}>
          Type the fields instead
        </Button>
      )}
      {error ? <p className="text-sm text-attention">{error}</p> : null}
      {extraction?.warnings.map((w) => (
        <p key={w} className="text-sm text-attention">
          {w}
        </p>
      ))}
      {values ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmed(true);
          }}
        >
          {FIELDS.map(({ key, label, placeholder }) => {
            const confidence = extraction?.confidence_per_field[key];
            const masked = demo && SENSITIVE.includes(key);
            const low = confidence !== undefined && confidence < 0.7;
            return (
              <label key={key} className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {label}
                  {low ? <span className="text-attention"> · check this</span> : null}
                </span>
                <Input
                  type={masked ? "password" : "text"}
                  autoComplete="off"
                  value={values[key]}
                  placeholder={masked ? undefined : placeholder}
                  aria-label={label}
                  aria-invalid={!values[key].trim() || undefined}
                  onChange={(e) => {
                    setConfirmed(false);
                    setValues({ ...values, [key]: e.target.value });
                  }}
                />
                {masked ? (
                  <span className="text-xs text-muted-foreground">
                    {maskField(key, values[key]) || "Not read yet: type it in"}
                  </span>
                ) : null}
              </label>
            );
          })}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" size="lg" className="h-9 rounded-full" disabled={!complete || confirmed}>
              <Check /> These are right
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
