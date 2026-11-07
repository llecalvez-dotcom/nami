"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeNext } from "@/lib/access";

export default function AccessPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error("Invalid access code.");
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(safeNext(next, window.location.origin));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify access code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="poster poster-orange m-auto flex w-[calc(100%-2rem)] max-w-sm flex-col gap-5 p-8">
      <div className="space-y-2">
        <p className="label-mono">Nami · access</p>
        <h1 className="display-title text-[45px]">Nami access</h1>
        <p className="text-sm text-muted-foreground">Enter the access code to continue.</p>
      </div>
      <form className="space-y-3" onSubmit={submit}>
        <label className="space-y-1 text-sm">
          <span>Access code</span>
          <Input
            autoComplete="current-password"
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm font-medium">{error}</p> : null}
        <Button type="submit" className="h-12 w-full rounded-full font-mono text-[11px] tracking-[0.1em] uppercase" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </Button>
      </form>
    </main>
  );
}
