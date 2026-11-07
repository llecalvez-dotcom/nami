import { describe, expect, it, vi } from "vitest";
import { createVisaStartAttempt, resetVisaStartAttempts } from "@/lib/paper-start-client";

describe("visa start attempts", () => {
  it("keeps the UUID and exact body across retries, but assigns a new UUID to a new attempt", async () => {
    const uuid = vi.fn().mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError("network failed"))
      .mockImplementation(async () => Response.json({ session_id: "s-1" }, { status: 201 }));
    const input = { paper_id: "evoa", local_session_id: "local-1" };
    const attempt = createVisaStartAttempt(input, { uuid, fetch });
    await expect(attempt()).rejects.toThrow("network failed");
    input.local_session_id = "changed-after-first-attempt";
    expect(await attempt()).toBe("s-1");
    expect(fetch.mock.calls[0][1]?.body).toBe(fetch.mock.calls[1][1]?.body);
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string)).toMatchObject({
      idempotency_key: "00000000-0000-4000-8000-000000000001", local_session_id: "local-1",
    });
    await createVisaStartAttempt(input, { uuid, fetch })();
    expect(JSON.parse(fetch.mock.calls[2][1]?.body as string).idempotency_key).toBe("00000000-0000-4000-8000-000000000002");
    expect(uuid).toHaveBeenCalledTimes(2);
  });

  it("surfaces the server's safe error and handles an empty response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ error: "All H agent slots are busy." }, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }));
    const attempt = createVisaStartAttempt({}, { fetch, uuid: () => "00000000-0000-4000-8000-000000000001" });
    await expect(attempt()).rejects.toThrow("All H agent slots are busy.");
    await expect(attempt()).rejects.toThrow("The agent could not start (502).");
  });

  it("reuses the key on a new click after an ambiguous failure with the same request, never after a clear one", async () => {
    resetVisaStartAttempts();
    let n = 0;
    const uuid = () => `00000000-0000-4000-8000-00000000000${++n}`;
    const keyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string).idempotency_key;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError("network failed"))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ session_id: "s-1" }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ error: "Invalid request." }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ session_id: "s-2" }, { status: 201 }));
    const input = { paper_id: "evoa" };
    await expect(createVisaStartAttempt(input, { fetch, uuid, scope: "trip-1" })()).rejects.toThrow();
    await expect(createVisaStartAttempt(input, { fetch, uuid, scope: "trip-1" })()).rejects.toThrow();
    expect(await createVisaStartAttempt(input, { fetch, uuid, scope: "trip-1" })()).toBe("s-1");
    await expect(createVisaStartAttempt(input, { fetch, uuid, scope: "trip-1" })()).rejects.toThrow();
    expect(await createVisaStartAttempt(input, { fetch, uuid, scope: "trip-1" })()).toBe("s-2");
    const keys = fetch.mock.calls.map(keyOf);
    expect(keys.slice(0, 3)).toEqual([keys[0], keys[0], keys[0]]);
    expect(new Set(keys.slice(3)).size).toBe(2);
    const resumed = fetch.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).resume ?? false);
    expect(resumed).toEqual([false, true, true, false, false]);
    expect(keys[3]).not.toBe(keys[0]);
  });

  it("assigns a new key when the request changed after an ambiguous failure", async () => {
    resetVisaStartAttempts();
    let n = 0;
    const uuid = () => `00000000-0000-4000-8000-00000000000${++n}`;
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError("network failed"))
      .mockResolvedValueOnce(Response.json({ session_id: "s-1" }, { status: 201 }));
    await expect(createVisaStartAttempt({ paper_id: "evoa", a: 1 }, { fetch, uuid, scope: "trip-1" })()).rejects.toThrow();
    await createVisaStartAttempt({ paper_id: "evoa", a: 2 }, { fetch, uuid, scope: "trip-1" })();
    const keys = fetch.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).idempotency_key);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("keeps the key when a successful response body is lost", async () => {
    resetVisaStartAttempts();
    let n = 0;
    const uuid = () => `00000000-0000-4000-8000-00000000000${++n}`;
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response("{", { status: 201 }))
      .mockResolvedValueOnce(Response.json({ session_id: "s-1" }, { status: 201 }));
    await expect(createVisaStartAttempt({ paper_id: "evoa" }, { fetch, uuid, scope: "trip-1" })()).rejects.toThrow();
    expect(await createVisaStartAttempt({ paper_id: "evoa" }, { fetch, uuid, scope: "trip-1" })()).toBe("s-1");
    const bodies = fetch.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));
    expect(bodies[1]).toMatchObject({ idempotency_key: bodies[0].idempotency_key, resume: true });
  });

  it("gives a new key after a busy-slots 429, so the next start runs the quota check", async () => {
    resetVisaStartAttempts();
    let n = 0;
    const uuid = () => `00000000-0000-4000-8000-00000000000${++n}`;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ error: "All H agent slots are busy." }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ session_id: "s-1" }, { status: 201 }));
    await expect(createVisaStartAttempt({ paper_id: "evoa" }, { fetch, uuid, scope: "trip-1" })()).rejects.toThrow();
    await createVisaStartAttempt({ paper_id: "evoa" }, { fetch, uuid, scope: "trip-1" })();
    const bodies = fetch.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));
    expect(bodies[1].idempotency_key).not.toBe(bodies[0].idempotency_key);
    expect(bodies[1]).not.toHaveProperty("resume");
  });
});
