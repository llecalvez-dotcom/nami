"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify access code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-5 py-10">
      <div className="space-y-2">
        <h1 className="font-heading text-3xl">Nami access</h1>
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
        {error ? <p className="text-sm text-attention">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </Button>
      </form>
    </main>
  );
}
