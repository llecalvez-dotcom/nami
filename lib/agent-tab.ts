import { agentChromePort, connectChrome, type CdpConnection } from "@/lib/chrome-cdp";

type Target = { targetId: string; type: string; url: string };

const BLANK_TAB = /^(about:blank|chrome:\/\/newtab)/;

// A search works in its own tab (Nathan, 2026-11-08): the visa form stays as the agent left it. Nami opens the page herself
// as soon as the traveller answers: H needs up to 40 s before its first action after another session, and the tab stayed
// blank all that time. A blank tab, or the tab of an earlier try of the same search, is reused, so a retry does not pile
// them up. Never an error: on any doubt the session starts as before and the agent opens the page itself.
export async function openSearchTab(url: string, connect: (port: number) => Promise<CdpConnection> = connectChrome, port: number | null = agentChromePort()): Promise<void> {
  if (port === null || process.env.NODE_ENV === "production") return;
  let client: CdpConnection | undefined;
  try {
    client = await connect(port);
    const { origin, pathname } = new URL(url);
    const { targetInfos } = await client.send("Target.getTargets") as { targetInfos: Target[] };
    const tab = targetInfos.find((target) => target.type === "page" && (BLANK_TAB.test(target.url) || target.url.startsWith(origin + pathname)));
    if (!tab) {
      await client.send("Target.createTarget", { url });
      return;
    }
    await client.send("Target.activateTarget", { targetId: tab.targetId });
    const { sessionId } = await client.send("Target.attachToTarget", { targetId: tab.targetId, flatten: true }) as { sessionId: string };
    await client.send("Page.navigate", { url }, sessionId);
  } catch {
    // The session is created as before.
  } finally {
    client?.close();
  }
}
