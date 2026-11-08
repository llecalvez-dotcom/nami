import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preflightBrowser, resetBrowserPreflight } from "@/lib/agent-preflight";
import { abandonSession, resetAgentStall } from "@/lib/agent-stall";
import type { CdpConnection } from "@/lib/chrome-cdp";

const DOMAIN = "evisa.imigrasi.go.id";
let fetch: ReturnType<typeof vi.fn>;
let send: ReturnType<typeof vi.fn<CdpConnection["send"]>>;
let close: ReturnType<typeof vi.fn<CdpConnection["close"]>>;
let connect: ReturnType<typeof vi.fn<(port: number) => Promise<CdpConnection>>>;

beforeEach(() => {
  resetBrowserPreflight();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NAMI_AGENT_CHROME_PORT", "9333");
  vi.stubEnv("HAI_API_KEY", "fictitious-key");
  fetch = vi.fn(async () => Response.json({ status: "running" }));
  vi.stubGlobal("fetch", fetch);
  send = vi.fn<CdpConnection["send"]>(async () => ({ targetInfos: [] }));
  close = vi.fn<CdpConnection["close"]>();
  connect = vi.fn<(port: number) => Promise<CdpConnection>>(async () => ({ send, close }));
});

afterEach(() => {
  resetBrowserPreflight();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function started() {
  const lease = await preflightBrowser("bridge-1", connect);
  lease.commit("session-1");
  lease.release();
}

describe("browser preflight", () => {
  it.each([[], [`https://${DOMAIN}/form`], [`https://apply.${DOMAIN}/form`], [`https://${DOMAIN}.example/form`]])(
    "allows zero or one official tab among unrelated pages: %j", async (...urls: string[]) => {
      send.mockResolvedValue({ targetInfos: [
        { type: "page", url: "about:blank" },
        { type: "page", url: "https://example.com" },
        { type: "worker", url: `https://${DOMAIN}/worker` },
        ...urls.map((url) => ({ type: "page", url })),
      ] });
      const lease = await preflightBrowser("bridge-1", connect);
      expect(connect).toHaveBeenCalledWith(9333);
      expect(send).toHaveBeenCalledWith("Target.getTargets");
      expect(close).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
      lease.release();
    },
  );

  it("opens a blank tab when the agent's Chrome has none, so the H bridge can attach", async () => {
    send.mockResolvedValueOnce({ targetInfos: [{ type: "service_worker", url: "chrome-extension://x/bg.js" }] });
    const lease = await preflightBrowser("bridge-1", connect);
    expect(send).toHaveBeenCalledWith("Target.createTarget", { url: "about:blank" });
    lease.release();
  });

  it("opens no tab when one is already there", async () => {
    send.mockResolvedValueOnce({ targetInfos: [{ type: "page", url: "about:blank" }] });
    (await preflightBrowser("bridge-1", connect)).release();
    expect(send).not.toHaveBeenCalledWith("Target.createTarget", expect.anything());
  });

  it("rejects several official page tabs and closes CDP without attaching", async () => {
    send.mockResolvedValue({ targetInfos: [
      { type: "page", url: `https://${DOMAIN}/form` },
      { type: "page", url: `https://apply.${DOMAIN}/form` },
    ] });
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Close the extra tabs") });
    expect(send).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it("fails safely on CDP errors without exposing paths or secrets", async () => {
    send.mockRejectedValue(new Error("/private/fictitious.jpg fictitious-key"));
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({
      status: 503, message: "Chrome DevTools is not ready. Run holo local browser --debug-port 9333 and keep it open, then try again.",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("releases a failed connection reservation and permits a retry", async () => {
    connect.mockRejectedValueOnce(new Error("Connection refused"));
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({ status: 503 });
    const lease = await preflightBrowser("bridge-1", connect);
    lease.release();
  });

  it.each(["pending", "queued", "running", "paused", "idle", "awaiting_tool_results", "unknown"])(
    "refuses an existing non-terminal session: %s", async (status) => {
      await started();
      fetch.mockResolvedValue(Response.json({ status }));
      await expect(preflightBrowser("new-bridge-id", connect)).rejects.toMatchObject({ status: 409 });
      expect(fetch).toHaveBeenCalledWith("https://agp.eu.hcompany.ai/api/v2/sessions/session-1/status", expect.objectContaining({ method: "GET" }));
      expect(connect).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["completed", "failed", "timed_out", "interrupted"])("allows replacement only after terminal status: %s", async (status) => {
    await started();
    fetch.mockResolvedValue(Response.json({ status }));
    const lease = await preflightBrowser("bridge-1", connect);
    lease.commit("session-2");
    lease.release();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it.each([503, 404])("keeps the active record when its status cannot be verified: %s", async (status) => {
    await started();
    for (let attempt = 0; attempt < (status === 503 ? 3 : 1); attempt++) {
      fetch.mockResolvedValueOnce(new Response("private details", { status, headers: { "Retry-After": "0" } }));
    }
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Could not check") });
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({ status: 409 });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("lets a new session take the browser from a stalled session Nami gave up, without asking H (H still says running)", async () => {
    await started();
    abandonSession("session-1");
    const lease = await preflightBrowser("bridge-1", connect);
    lease.commit("session-2");
    lease.release();
    expect(fetch).not.toHaveBeenCalled();
    resetAgentStall();
  });

  it("rejects malformed status rather than assuming the previous session is finished", async () => {
    await started();
    fetch.mockResolvedValue(Response.json({ status: null }));
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({ status: 503 });
  });

  it("reserves the browser during creation, including a changed port with the same bridge id", async () => {
    const lease = await preflightBrowser("bridge-1", connect);
    await expect(preflightBrowser("bridge-2", connect)).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("NAMI_AGENT_CHROME_PORT", "9444");
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({ status: 409 });
    lease.release();
    const retry = await preflightBrowser("bridge-1", connect);
    retry.release();
  });

  it("checks an active bridge even after the configured port changes", async () => {
    await started();
    vi.stubEnv("NAMI_AGENT_CHROME_PORT", "9444");
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses invalid port configuration without any network request", async () => {
    vi.stubEnv("NAMI_AGENT_CHROME_PORT", "65536");
    await expect(preflightBrowser("bridge-1", connect)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("NAMI_AGENT_CHROME_PORT") });
    expect(connect).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bypasses local checks in production even with invalid configuration and an active record", async () => {
    await started();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NAMI_AGENT_CHROME_PORT", "invalid");
    const lease = await preflightBrowser("bridge-1", connect);
    lease.commit("production-session");
    lease.release();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
