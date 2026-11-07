(() => {
  const host = document.createElement("div");
  host.id = "nami-agent-overlay";
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host, *, *::before, *::after { pointer-events: none !important; box-sizing: border-box; }
    :host { all: initial; font-family: system-ui, sans-serif; }
    .cursor { position: fixed; left: 0; top: 0; width: 24px; height: 24px; opacity: 0;
      transition: transform 450ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease-out; filter: drop-shadow(0 1px 3px #3b176e66); }
    .ripple { position: fixed; width: 18px; height: 18px; margin: -9px; border: 2px solid #8b5cf6;
      border-radius: 50%; background: #8b5cf633; animation: ripple 400ms ease-out forwards; }
    @keyframes ripple { from { transform: scale(.5); opacity: 1; } to { transform: scale(3); opacity: 0; } }
    .field { position: fixed; border: 2px solid #8b5cf6; border-radius: 6px; box-shadow: 0 0 12px #8b5cf688; }
    .frame { position: fixed; inset: 0; border: 3px solid #8b5cf6; box-shadow: inset 0 0 16px #8b5cf655; }
    .label { position: fixed; top: 3px; left: 50%; transform: translateX(-50%); padding: 5px 12px;
      border-radius: 0 0 10px 10px; background: #6d28d9; color: white; font: 600 12px system-ui, sans-serif; }
    .bubble { position: fixed; bottom: 16px; left: 16px; max-width: min(320px, calc(100vw - 32px));
      padding: 12px 16px; border: 1px solid #c4b5fd; border-radius: 16px; background: #f5f3fff2;
      color: #3b176e; box-shadow: 0 4px 20px #3b176e22; font: 14px/1.4 system-ui, sans-serif;
      overflow-wrap: anywhere; white-space: pre-wrap; }
    [hidden] { display: none !important; }
  `;
  shadow.append(style);
  const layer = (className) => {
    const element = document.createElement("div");
    element.className = className;
    shadow.append(element);
    return element;
  };
  const frame = layer("frame");
  const label = layer("label");
  label.textContent = "Nami is filling this in";
  const bubble = layer("bubble");
  frame.hidden = label.hidden = bubble.hidden = true;
  const field = layer("field");
  field.hidden = true;
  const cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  cursor.setAttribute("class", "cursor");
  cursor.setAttribute("viewBox", "0 0 24 24");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("d", "M2 2 20 12 12 14 9 22Z");
  arrow.setAttribute("fill", "#8b5cf6");
  arrow.setAttribute("stroke", "white");
  arrow.setAttribute("stroke-width", "1.5");
  cursor.append(arrow);
  shadow.append(cursor);
  document.documentElement.append(host);

  let fieldTimer;
  let agentActive = false;
  // The agent's clicks and a real mouse send the same trusted events (CDP sets the same screen coordinates, measured
  // 2026-11-07). The cursor therefore follows presses only: hovering with the real mouse never moves it, and it glides
  // from one click of the agent to the next. It stays visible while the agent works.
  const move = (event) => {
    cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    cursor.style.opacity = agentActive ? "1" : "0";
  };
  const ripple = (x, y) => {
    const ring = layer("ripple");
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.addEventListener("animationend", () => ring.remove(), { once: true });
  };
  // Nami's pick_option shows where it picks (lib/local-chrome.ts, showPickExpression): the page sets the point on the
  // root element, the same DOM for the page and this script. Only moves the cursor while the agent works.
  document.addEventListener("nami-agent-point", () => {
    const [x, y] = String(document.documentElement.dataset.namiAgentPoint || "").split(",").map(Number);
    if (!agentActive || !Number.isFinite(x) || !Number.isFinite(y)) return;
    move({ clientX: x, clientY: y });
    setTimeout(() => ripple(x, y), 380);
  });
  const highlight = (event) => {
    if (!(event.target instanceof Element)) return;
    const rect = event.target.getBoundingClientRect();
    field.style.left = `${rect.left}px`;
    field.style.top = `${rect.top}px`;
    field.style.width = `${rect.width}px`;
    field.style.height = `${rect.height}px`;
    field.hidden = false;
    clearTimeout(fieldTimer);
    fieldTimer = setTimeout(() => { field.hidden = true; }, 800);
  };
  for (const type of ["pointerdown", "input", "focusin"]) {
    document.addEventListener(type, (event) => {
      if (!event.isTrusted) return;
      if (type === "pointerdown") move(event);
      if (type === "pointerdown") ripple(event.clientX, event.clientY);
      if (type === "input" || type === "focusin") highlight(event);
    }, true);
  }
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "nami:agent-state"
      || typeof message.active !== "boolean" || typeof message.step !== "string") return;
    agentActive = message.active;
    if (!agentActive) cursor.style.opacity = "0";
    frame.hidden = label.hidden = !message.active;
    bubble.textContent = message.step.slice(0, 320).replace(/[–—]/g, ", ");
    bubble.hidden = !message.active || !message.step.trim();
  });
})();
