import { describe, expect, it, vi } from "vitest";
import { createVisaStartAttempt } from "@/lib/paper-start-client";

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
});
