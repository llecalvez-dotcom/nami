// Local only: acts on a field of the official form in the traveller's own Chrome, through its DevTools port, when the
// agent's clicks and keystrokes are not enough: a native <select> hidden behind a custom dropdown (Select2...), or a
// text field whose page listens to jQuery events the agent's typing never fires (the e-VOA postal code).

import { agentChromePort } from "@/lib/chrome-cdp";

type CdpTab = { type: string; url: string; webSocketDebuggerUrl?: string };

export const SCREENSHOT_GUIDANCE = "Do not reload or refresh the page or navigate away; take a screenshot and continue with the next field.";
// The page's postal code lookup is an AJAX call: fill_field waits this long before reading the fields it filled.
export const FILL_SETTLE_MS = 2500;

export function localChromeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production";
}

export function cdpUrls(env: Record<string, string | undefined> = process.env): string[] {
  const port = agentChromePort(env);
  return port === null ? [] : [`http://127.0.0.1:${port}`];
}

async function listTabs(urls: string[]): Promise<CdpTab[]> {
  for (const url of urls) {
    try {
      const response = await fetch(`${url}/json`);
      if (response.ok) return (await response.json()) as CdpTab[];
    } catch {
      // Not this port, try the next one.
    }
  }
  throw new Error("Chrome is not reachable on its DevTools port.");
}

function onDomain(url: string, domains: string[]): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "https:" || protocol === "http:") && domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// Runs in the page, shared by pick_option and fill_field: the texts that name a field. The label of the field's block
// counts too, without the "*" of required fields: on the e-VOA, the label's "for" points to a wrong id (staticEmail),
// so element.labels is empty, and the nearest div only holds the Select2 placeholder.
const FIELD_HELPERS = `
  const norm = (s) => String(s || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim().toLowerCase();
  const groupLabel = (el) => {
    let node = el.parentElement;
    for (let depth = 0; node && depth < 4; depth += 1) {
      const label = node.querySelector && node.querySelector("label");
      if (label) return label.textContent;
      if (node.matches && node.matches(".form-group, form")) break;
      node = node.parentElement;
    }
    return "";
  };
  const labelTexts = (el) => [el.name, el.id, el.getAttribute("aria-label"), el.getAttribute("placeholder"), ...(el.labels ? [...el.labels].map((l) => l.innerText) : []), groupLabel(el), el.closest(".form-group, .mb-3, div")?.innerText.split("\\n")[0]].map(norm).filter(Boolean);
  const labelOf = (el) => labelTexts(el).join(" ");
  const byLabel = (els, f) => {
    const exact = els.filter((el) => f && labelTexts(el).some((t) => t === f));
    return exact.length ? exact : els.filter((el) => f && labelOf(el).includes(f));
  };
  const nameOf = (el) => norm(groupLabel(el)) || el.name || el.id || "";
`;

// Runs in the page: finds the select whose name, id or label matches the field, then the option matching the value.
export function pickExpression(field: string, option: string): string {
  return `((field, option) => {${FIELD_HELPERS}
  const f = norm(field), o = norm(option);
  const selects = [...document.querySelectorAll("select")].filter((s) => !s.disabled);
  const named = byLabel(selects, f);
  for (const s of named.length ? named : selects) {
    const opts = [...s.options];
    const hit = opts.find((x) => norm(x.text) === o) || opts.find((x) => norm(x.text).startsWith(o)) || opts.find((x) => norm(x.text).includes(o));
    if (!hit) continue;
    if (window.jQuery) {
      window.jQuery(s).val(hit.value).trigger("change");
      window.jQuery(s).trigger({ type: "select2:select", params: { data: { id: hit.value, text: hit.text, element: hit } } });
    }
    else { s.value = hit.value; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); }
    return "Picked " + hit.text.trim() + " in " + (s.name || s.id || "the list") + ". The page already shows it. ${SCREENSHOT_GUIDANCE}";
  }
  const target = named[0];
  if (!target) {
    const lists = selects.map((s) => s.name || s.id).filter(Boolean).slice(0, 30);
    return "No list has an option matching " + option + ". No list is labelled " + field + "; lists on this page: " + (lists.join(", ") || "none") + ". Call pick_option again with one of them.";
  }
  const options = [...target.options].filter((x) => x.value !== "").map((x) => x.text.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 30);
  return "No list has an option matching " + option + ". Options of " + (target.name || target.id || field) + ": " + (options.join(", ") || "none") + ". Call pick_option again with the closest one.";
})(${JSON.stringify(field)}, ${JSON.stringify(option)})`;
}

// Runs in the page: finds the text field whose name, id or label matches the field, writes the value, fires input,
// change and keyup (through jQuery when the page has it), then reports the value read back and the other fields the
// page filled meanwhile (Province, City... after the postal code). Resolves after settleMs.
export function fillExpression(field: string, value: string, settleMs = FILL_SETTLE_MS): string {
  return `((field, value, settleMs) => {${FIELD_HELPERS}
  const f = norm(field);
  const fillable = (el) => el.tagName === "TEXTAREA" || !/^(hidden|file|checkbox|radio|submit|button|reset|image|range|color)$/i.test(el.type || "text");
  const inputs = [...document.querySelectorAll("input, textarea")].filter((el) => !el.disabled && !el.readOnly && fillable(el));
  const target = byLabel(inputs, f)[0];
  if (!target) {
    const names = [...new Set(inputs.map(nameOf).filter(Boolean))].slice(0, 30);
    return "No field is labelled " + field + "; fields on this page: " + (names.join(", ") || "none") + ". Call fill_field again with one of them, or type the value yourself.";
  }
  const others = [...document.querySelectorAll("input, select, textarea")].filter((el) => el !== target && fillable(el)).map((el) => [el, el.value]);
  const shown = (el) => el.tagName === "SELECT" ? (el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : el.value) : el.value;
  if (target.focus) target.focus();
  target.value = value;
  if (window.jQuery) window.jQuery(target).val(value).trigger("input").trigger("change").trigger("keyup");
  else {
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }
  const report = () => {
    const filled = others.filter(([el, before]) => el.isConnected !== false && el.value !== before && String(el.value) !== "").map(([el]) => (nameOf(el) || "a field") + ": " + String(shown(el)).replace(/\\s+/g, " ").trim()).slice(0, 12);
    return "Filled " + (nameOf(target) || field) + " with " + String(target.value) + "." + (filled.length ? " The page then filled: " + filled.join("; ") + "." : "") + " ${SCREENSHOT_GUIDANCE}";
  };
  return settleMs > 0 ? new Promise((resolve) => setTimeout(() => resolve(report()), settleMs)) : report();
})(${JSON.stringify(field)}, ${JSON.stringify(value)}, ${Number(settleMs) || 0})`;
}

const NO_OFFICIAL_TAB = "The official site is not open in Chrome.";
export const NOT_ON_OFFICIAL_SITE = "The tab is no longer on the official site; nothing was changed. Take a screenshot and go back to the official form.";

export const AGENT_POINT_EVENT = "nami-agent-point";

// Runs in the page, before the pick, so the traveller sees it happen (Nathan, 2026-11-07: « on ne voit pas que tu
// scrolles pour aller chercher France »): the purple cursor of the extension goes to the list, the Select2 list opens,
// the option is typed letter by letter in its search field, the cursor points at the line found, then the list closes.
// It never selects anything itself; pickExpression does, right after. Resolves "no" when there is nothing to show.
export function showPickExpression(field: string, option: string): string {
  return `((field, option) => new Promise((resolve) => {${FIELD_HELPERS}
  const $ = window.jQuery;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const point = (el) => {
    const r = el.getBoundingClientRect();
    document.documentElement.dataset.namiAgentPoint = Math.round(r.left + Math.min(r.width / 2, 48)) + "," + Math.round(r.top + r.height / 2);
    document.dispatchEvent(new Event(${JSON.stringify(AGENT_POINT_EVENT)}));
  };
  try {
    const f = norm(field), o = norm(option);
    const selects = [...document.querySelectorAll("select")].filter((x) => !x.disabled);
    const named = byLabel(selects, f);
    const s = (named.length ? named : selects).find((x) => [...x.options].some((y) => norm(y.text).includes(o)));
    const box = s && s.nextElementSibling && (s.nextElementSibling.querySelector(".select2-selection") || s.nextElementSibling);
    if (!s || !$ || !$(s).data("select2") || !box) return resolve("no");
    (async () => {
      box.scrollIntoView({ block: "center", behavior: "smooth" });
      await wait(400);
      point(box);
      await wait(500);
      $(s).select2("open");
      await wait(250);
      const search = document.querySelector(".select2-container--open .select2-search__field");
      const text = String(option).slice(0, 14);
      if (search) {
        for (let i = 1; i <= text.length; i++) {
          search.value = text.slice(0, i);
          search.dispatchEvent(new Event("input", { bubbles: true }));
          search.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
          await wait(70);
        }
      }
      await wait(300);
      const line = document.querySelector(".select2-container--open .select2-results__option--highlighted");
      if (line) {
        point(line);
        await wait(500);
      }
      $(s).select2("close");
      resolve("shown");
    })().catch(() => {
      try { $(s).select2("close"); } catch (e) {}
      resolve("no");
    });
  } catch (e) {
    resolve("no");
  }
}))(${JSON.stringify(field)}, ${JSON.stringify(option)})`;
}

// Runs in the page, around the action: the tab was official when chosen, but it may have navigated since. The page
// itself checks its hostname again, so the traveller's data never goes into another site.
export function guardedExpression(expression: string, domains: string[]): string {
  return `((domains) => {
  const h = String(location.hostname || "").toLowerCase();
  if (!/^https?:$/.test(location.protocol) || !domains.some((d) => h === d || h.endsWith("." + d))) return ${JSON.stringify(NOT_ON_OFFICIAL_SITE)};
  return (${expression});
})(${JSON.stringify(domains.map((d) => d.toLowerCase()))})`;
}

async function evaluateInOfficialTab(expression: string, domains: string[], urls: string[], fallback: string, timeoutMs: number): Promise<string> {
  const tabs = await listTabs(urls);
  const tab = tabs.find((t) => t.type === "page" && t.webSocketDebuggerUrl && onDomain(t.url, domains));
  if (!tab?.webSocketDebuggerUrl) return NO_OFFICIAL_TAB;
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Chrome did not answer."));
    }, timeoutMs);
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Could not reach Chrome."));
    };
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: guardedExpression(expression, domains), returnByValue: true, awaitPromise: true } }));
    ws.onmessage = (event) => {
      const reply = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } } };
      if (reply.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      const value = reply.result?.result?.value;
      resolve(typeof value === "string" ? value : fallback);
    };
  });
}

export async function pickOption(field: string, option: string, domains: string[], urls = cdpUrls()): Promise<string> {
  // Showing the pick is a nicety: whatever happens there, the pick itself runs right after (unless no official tab is open).
  const shown = await evaluateInOfficialTab(showPickExpression(field, option), domains, urls, "no", 6000).catch(() => "no");
  if (shown === NO_OFFICIAL_TAB) return shown;
  return evaluateInOfficialTab(pickExpression(field, option), domains, urls, "Chrome could not pick the option.", 5000);
}

export async function fillField(field: string, value: string, domains: string[], urls = cdpUrls()): Promise<string> {
  return evaluateInOfficialTab(fillExpression(field, value), domains, urls, "Chrome could not fill the field.", FILL_SETTLE_MS + 5000);
}
