"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocumentExtraction, PassportFieldKey } from "@/lib/contracts";
import { expiryWarning } from "@/lib/passport-dates";

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
  const [reader, setReader] = useState<"off" | "h" | "anthropic">("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [edited, setEdited] = useState<PassportFieldKey[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    fetch("/api/documents/extract")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((result: { reader?: string }) => {
        if (active) setReader(result.reader === "h" || result.reader === "anthropic" ? result.reader : "off");
      })
      .catch(() => {
        if (active) setReader("off");
      });
    return () => {
      active = false;
    };
  }, []);

  const upload = async (file: File) => {
    const id = ++requestId.current;
    setError(null);
    setConfirmed(false);
    if (reader === "off" || !consent) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return setError("Send a JPEG or PNG photo.");
    if (file.size > MAX_BYTES) return setError("Photo too large (5 MB max).");
    const body = new FormData();
    body.set("consent_provider", reader);
    body.set("image", file);
    if (returnDate) body.set("return_date", returnDate);
    if (arrivalAt) body.set("arrival_at", arrivalAt);
    setBusy(true);
    try {
      const response = await fetch("/api/documents/extract", { method: "POST", body });
      if (id !== requestId.current) return;
      const json = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(json.error ?? "The passport could not be read.");
      const result = json as DocumentExtraction;
      setExtraction(result);
      setEdited([]);
      setValues(Object.fromEntries(FIELDS.map((f) => [f.key, result.fields[f.key] ?? ""])) as Values);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(`${(e as Error).message} You can type the fields instead.`);
      setExtraction(null);
      setValues((v) => v ?? EMPTY);
    } finally {
      if (id !== requestId.current) return;
      setBusy(false);
    }
  };

  const manual = reader === "off" || values !== null;
  const displayedValues = values ?? EMPTY;
  const trip = { return_date: returnDate, arrival_at: arrivalAt };
  const liveExpiryWarning = expiryWarning(displayedValues.expiry_date, trip);
  const complete = manual && FIELDS.every((f) => displayedValues[f.key].trim());
  const hasData = Boolean(
    error || extraction || confirmed || (values && FIELDS.some((field) => values[field.key].trim())),
  );
  const provider = reader === "h" ? "H Company" : "Anthropic";
  const clear = () => {
    requestId.current++;
    setBusy(false);
    setValues(null);
    setExtraction(null);
    setEdited([]);
    setError(null);
    setConfirmed(false);
    setConsent(false);
  };

  return (
    <section className="space-y-4 rounded-[28px] bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg leading-snug font-semibold tracking-tight">{reader === "off" ? "Enter passport details" : "Send me a photo of your passport"}</p>
        <div className="flex items-center gap-2">
          {confirmed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-1 text-xs font-medium text-success">
              <Check className="size-4" /> Confirmed
            </span>
          ) : null}
          {hasData ? (
            <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={clear}>
              Clear passport data
            </Button>
          ) : null}
        </div>
      </div>
      {reader === "off" ? (
        <p className="text-sm text-muted-foreground">
          Automatic reading is off: nothing leaves this device. Type the fields from your passport.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">The identity page, sharp and flat. It is read in memory and never stored.</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>I agree that this photo is sent to {provider} to read it (not stored by Nami)</span>
          </label>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-glow has-[:disabled]:opacity-50">
            <Camera className="size-4" /> {busy ? "Reading…" : values ? "Send another photo" : "Choose a photo"}
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              disabled={busy || !consent}
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
        </>
      )}
      {error ? <p className="text-sm text-attention-foreground">{error}</p> : null}
      {liveExpiryWarning ? <p className="text-sm text-attention-foreground">{liveExpiryWarning}</p> : null}
      {extraction?.warnings.filter((w) => !w.startsWith("Your passport expires on ")).map((w) => (
        <p key={w} className="text-sm text-attention-foreground">
          {w}
        </p>
      ))}
      {manual ? (
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
                  {extraction?.mrz_verified?.includes(key) && !edited.includes(key) ? (
                    <span className="ml-1 text-success">Checked against MRZ</span>
                  ) : null}
                  {low ? <span className="text-attention-foreground"> · check this</span> : null}
                </span>
                <Input
                  className="h-10 rounded-xl border-transparent bg-muted px-3"
                  type={masked ? "password" : "text"}
                  autoComplete="off"
                  value={displayedValues[key]}
                  placeholder={masked ? undefined : placeholder}
                  aria-label={label}
                  aria-invalid={(!displayedValues[key].trim() && (edited.includes(key) || extraction !== null)) || undefined}
                  onChange={(e) => {
                    setConfirmed(false);
                    setEdited((keys) => keys.includes(key) ? keys : [...keys, key]);
                    setValues({ ...displayedValues, [key]: e.target.value });
                  }}
                />
                {masked ? (
                  <span className="text-xs text-muted-foreground">
                    {maskField(key, displayedValues[key]) || "Not read yet: type it in"}
                  </span>
                ) : null}
              </label>
            );
          })}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" size="lg" className="h-10 rounded-full px-5 shadow-glow disabled:shadow-none" disabled={!complete || confirmed}>
              <Check /> These are right
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
