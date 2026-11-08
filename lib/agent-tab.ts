import { agentChromePort, connectChrome, type CdpConnection } from "@/lib/chrome-cdp";

type Target = { targetId: string; type: string; url: string };

// A search works in its own tab (Nathan, 2026-11-08): the visa form stays as the agent left it. A blank tab already
// there is reused, so a retry does not pile them up. Never an error: on any doubt the session starts as before.
export async function ensureBlankAgentTab(connect: (port: number) => Promise<CdpConnection> = connectChrome, port: number | null = agentChromePort()): Promise<void> {
  if (port === null || process.env.NODE_ENV === "production") return;
  let client: CdpConnection | undefined;
  try {
    client = await connect(port);
    const { targetInfos } = await client.send("Target.getTargets") as { targetInfos: Target[] };
    const blank = targetInfos.find((target) => target.type === "page" && /^(about:blank|chrome:\/\/newtab)/.test(target.url));
    if (blank) await client.send("Target.activateTarget", { targetId: blank.targetId });
    else await client.send("Target.createTarget", { url: "about:blank" });
  } catch {
    // The session is created as before.
  } finally {
    client?.close();
  }
}
