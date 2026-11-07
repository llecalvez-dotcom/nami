import { it, expect } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { findDocuments } from "@/lib/documents";
import { bindSessionDocument, uploadSessionDocument } from "@/lib/agent-passport-upload";
import { connectChrome } from "@/lib/chrome-cdp";

const smoke = process.env.NAMI_CDP_SMOKE === "1" ? it : it.skip;

smoke("real Chrome: confirmed file arrives with exactly one input and change event", async () => {
  const root = await mkdtemp(join(tmpdir(), "nami-real-upload-"));
  const oldDocuments = process.env.NAMI_DOCUMENTS_DIR;
  const oldPort = process.env.NAMI_AGENT_CHROME_PORT;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><input type="file"><script>
      window.counts = { input: 0, change: 0 };
      const input = document.querySelector("input");
      input.addEventListener("input", () => window.counts.input++);
      input.addEventListener("change", () => window.counts.change++);
    </script>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local server unavailable");
  const debug = createServer();
  debug.listen(0, "127.0.0.1");
  await once(debug, "listening");
  const debugAddress = debug.address();
  if (!debugAddress || typeof debugAddress === "string") throw new Error("Local port unavailable");
  const port = debugAddress.port;
  await new Promise<void>((resolve) => debug.close(() => resolve()));
  const chrome = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--no-proxy-server", "--no-first-run",
    "--disable-background-networking", "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=" + port, "--user-data-dir=" + join(root, "chrome"),
    "--host-resolver-rules=MAP evisa.imigrasi.go.id 127.0.0.1",
    `http://evisa.imigrasi.go.id:${address.port}/`,
  ], { stdio: "ignore" });
  try {
    await mkdir(join(root, "documents"));
    await writeFile(join(root, "documents", "passport-fictitious.jpg"), "fictitious image bytes");
    process.env.NAMI_DOCUMENTS_DIR = join(root, "documents");
    process.env.NAMI_AGENT_CHROME_PORT = String(port);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const client = await connectChrome(port);
        try {
          const targets = await client.send("Target.getTargets") as { targetInfos: { targetId: string; url: string }[] };
          const tab = targets.targetInfos.find((target) => target.url.startsWith("http://evisa.imigrasi.go.id:"));
          if (tab) {
            const attached = await client.send("Target.attachToTarget", { targetId: tab.targetId, flatten: true }) as { sessionId: string };
            const state = await client.send("Runtime.evaluate", {
              expression: "document.readyState === 'complete' && !!document.querySelector('input[type=file]')",
              returnByValue: true,
            }, attached.sessionId) as { result: { value: boolean } };
            ready = state.result.value;
          }
        } finally { client.close(); }
      } catch { /* Chrome is still starting. */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(ready).toBe(true);
    const [document] = await findDocuments();
    bindSessionDocument("smoke-session", document.id);
    expect(await uploadSessionDocument("smoke-session", {
      tool_name: "upload_file", args: { purpose: "passport" }, id: "smoke-upload",
    })).toBe("uploaded");
    const client = await connectChrome(port);
    try {
      const targets = await client.send("Target.getTargets") as { targetInfos: { targetId: string; url: string }[] };
      const tab = targets.targetInfos.find((target) => target.url.startsWith("http://evisa.imigrasi.go.id:"))!;
      const attached = await client.send("Target.attachToTarget", { targetId: tab.targetId, flatten: true }) as { sessionId: string };
      const observed = await client.send("Runtime.evaluate", {
        expression: "({ files: document.querySelector('input').files.length, ...window.counts })",
        returnByValue: true,
      }, attached.sessionId) as { result: { value: unknown } };
      expect(observed.result.value).toEqual({ files: 1, input: 1, change: 1 });
    } finally { client.close(); }
  } finally {
    if (oldDocuments === undefined) delete process.env.NAMI_DOCUMENTS_DIR;
    else process.env.NAMI_DOCUMENTS_DIR = oldDocuments;
    if (oldPort === undefined) delete process.env.NAMI_AGENT_CHROME_PORT;
    else process.env.NAMI_AGENT_CHROME_PORT = oldPort;
    if (chrome.exitCode === null) {
      const exited = once(chrome, "exit");
      chrome.kill();
      await exited;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
