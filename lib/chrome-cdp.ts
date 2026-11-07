export type CdpConnection = {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown>;
  close(): void;
};

const TIMEOUT_MS = 5_000;

export function agentChromePort(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.NAMI_AGENT_CHROME_PORT || "9222";
  if (!/^\d+$/.test(raw)) return null;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

export async function connectChrome(port: number): Promise<CdpConnection> {
  if (typeof WebSocket === "undefined") throw new Error("CDP unavailable");
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("CDP unavailable");
  const version = await response.json() as { webSocketDebuggerUrl?: string };
  const url = new URL(version.webSocketDebuggerUrl ?? "");
  if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" || url.port !== String(port)) {
    throw new Error("CDP unavailable");
  }
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map<number, { resolve(value: unknown): void; reject(): void }>();
  const failPending = () => {
    for (const entry of pending.values()) entry.reject();
    pending.clear();
  };
  socket.addEventListener("close", failPending);
  socket.addEventListener("error", failPending);
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown };
      if (message.id === undefined) return;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject();
      else entry.resolve(message.result);
    } catch {
      failPending();
      socket.close();
    }
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("CDP unavailable")); }, TIMEOUT_MS);
    const finish = (error: boolean) => {
      clearTimeout(timer);
      socket.removeEventListener("open", opened);
      socket.removeEventListener("error", failed);
      socket.removeEventListener("close", failed);
      if (error) { socket.close(); reject(new Error("CDP unavailable")); }
      else resolve();
    };
    const opened = () => finish(false);
    const failed = () => finish(true);
    socket.addEventListener("open", opened);
    socket.addEventListener("error", failed);
    socket.addEventListener("close", failed);
  });
  return {
    send(method, params = {}, sessionId) {
      if (socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("CDP unavailable"));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("CDP unavailable"));
        }, TIMEOUT_MS);
        pending.set(id, {
          resolve: (value) => { clearTimeout(timer); resolve(value); },
          reject: () => { clearTimeout(timer); reject(new Error("CDP unavailable")); },
        });
        try {
          socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        } catch {
          pending.get(id)?.reject();
          pending.delete(id);
        }
      });
    },
    close() {
      failPending();
      socket.close();
    },
  };
}
