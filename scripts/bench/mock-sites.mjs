// Ticket 0: serves the local copies of the official forms (fixtures/sites) for the test bench, one site per host:
//   http://evoa.test.localhost:3100/web/visa-selection
//   http://allindonesia.test.localhost:3100/arrival-card-submission/personal-information
// Chrome resolves *.localhost to 127.0.0.1 by itself. Each page posts what happens to /__mock/event; the result of the
// current run is kept in memory and written to NAMI_MOCK_RESULTS_DIR/<site>.json after every event.
//   GET  /__mock/result            the current result of the site named by the Host header
//   POST /__mock/reset             starts a new result (the bench calls it before each task)
//   POST /__mock/event             one event from the page ({ type, ... }, see mock-recorder.mjs)
// Usage: node scripts/bench/mock-sites.mjs [--port 3100]   (env: NAMI_MOCK_SITES_PORT, NAMI_MOCK_RESULTS_DIR)
// The real sites are never contacted: this server only reads files under fixtures/sites.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyResult, record } from "./mock-recorder.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../fixtures/sites", import.meta.url)));
const argPort = process.argv.indexOf("--port");
const PORT = Number(argPort !== -1 ? process.argv[argPort + 1] : process.env.NAMI_MOCK_SITES_PORT ?? 3100);
const RESULTS = resolve(process.env.NAMI_MOCK_RESULTS_DIR ?? "bench/mock-results");
mkdirSync(RESULTS, { recursive: true });

const SITES = {
  "evoa.test.localhost": {
    dir: "evoa",
    routes: { "/": "visa-selection.html", "/web/visa-selection": "visa-selection.html", "/web/application/step-1": "step-1.html", "/web/application/step-2": "step-2.html" },
  },
  "allindonesia.test.localhost": {
    dir: "allindonesia",
    routes: { "/": "personal-information.html", "/arrival-card-submission/personal-information": "personal-information.html" },
  },
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const results = new Map();
const resultOf = (site) => results.get(site) ?? results.set(site, emptyResult(site)).get(site);
const save = (site) => writeFileSync(join(RESULTS, `${site}.json`), JSON.stringify(results.get(site), null, 2));

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(body);
};
const readBody = (req) => new Promise((done) => {
  let data = "";
  req.on("data", (chunk) => { data += chunk; if (data.length > 64 * 1024) req.destroy(); });
  req.on("end", () => { try { done(JSON.parse(data || "{}")); } catch { done({}); } });
});

createServer(async (req, res) => {
  const host = String(req.headers.host ?? "").split(":")[0];
  const site = SITES[host];
  const url = new URL(req.url ?? "/", `http://${host}`);
  if (!site) return send(res, 404, JSON.stringify({ error: `Unknown mock host ${host}` }));
  const key = site.dir;
  if (url.pathname === "/__mock/result") return send(res, 200, JSON.stringify(resultOf(key)));
  if (url.pathname === "/__mock/reset" && req.method === "POST") {
    results.set(key, emptyResult(key));
    save(key);
    return send(res, 200, JSON.stringify(results.get(key)));
  }
  if (url.pathname === "/__mock/event" && req.method === "POST") {
    results.set(key, record(resultOf(key), await readBody(req)));
    save(key);
    return send(res, 204, "");
  }
  // Shared assets, then the site's routes, then a file of the site's folder (never outside fixtures/sites).
  let file = url.pathname.startsWith("/__mock/") ? join(ROOT, "shared", url.pathname.slice("/__mock/".length))
    : site.routes[url.pathname] ? join(ROOT, site.dir, site.routes[url.pathname])
    : join(ROOT, site.dir, normalize(url.pathname));
  file = resolve(file);
  if (!file.startsWith(ROOT) || !existsSync(file) || extname(file) === "") return send(res, 404, "<h1>Not found (mock)</h1>", "text/html");
  send(res, 200, readFileSync(file), TYPES[extname(file)] ?? "application/octet-stream");
}).listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-sites] serving fixtures/sites on 127.0.0.1:${PORT} for ${Object.keys(SITES).join(", ")}; results in ${RESULTS}`);
});
