// Renders ```html-app fences: sanitized HTML whose <script>s and on* handlers run, on click, in the sval interpreter.
import Sval from "sval";
import { el, renderFences, toolbar, toolButton } from "./fenceBlocks";
import { mountPreview, sanitizeDoc } from "./htmlBlocks";

const PURIFY_APP = {
  FORCE_BODY: true,
  ADD_TAGS: ["style"],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "base", "meta", "link"],
  FORBID_ATTR: ["action", "formaction", "srcdoc"],
};
const ALLOWED_LOWER = new Set(["undefined", "NaN", "Infinity", "console", "parseInt", "parseFloat", "isNaN", "isFinite",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "atob", "btoa", "queueMicrotask",
  "structuredClone", "performance", "crypto", "exports"]);
const DENIED_UPPER = new Set(["Function", "XMLHttpRequest", "WebSocket", "Worker", "SharedWorker", "EventSource",
  "BroadcastChannel", "Notification", "ServiceWorker", "PaymentRequest", "MessageChannel", "Request", "Response"]);
const ALLOWED_TAGS = /^(div|span|p|a|b|i|em|strong|small|ul|ol|li|table|thead|tbody|tr|th|td|h[1-6]|button|input|label|select|option|textarea|canvas|svg|img|br|hr|pre|code|section|article|header|footer|details|summary|progress|meter|output|form|fieldset|legend)$/i;

interface Prepared { html: string; scripts: string[] }

// Scripts and on* attributes are lifted out before sanitizing; handlers ride along as data-ob-on-<event>.
function prepare(src: string): Prepared {
  const doc = new DOMParser().parseFromString(src, "text/html");
  const scripts = Array.from(doc.querySelectorAll("script:not([src])")).map((s) => s.textContent ?? "");
  doc.querySelectorAll("script").forEach((s) => s.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      if (!attr.name.startsWith("on")) continue;
      node.setAttribute(`data-ob-on-${attr.name.slice(2)}`, attr.value);
      node.removeAttribute(attr.name);
    }
  });
  return { html: sanitizeDoc(doc, PURIFY_APP), scripts };
}

interface Runtime { stop(): void }

function lockDown(g: Record<string, unknown>): void {
  for (const k of Object.keys(g)) {
    const ok = /^[A-Z]/.test(k) ? !DENIED_UPPER.has(k) : ALLOWED_LOWER.has(k);
    if (!ok) g[k] = undefined;
  }
}

function startApp(root: HTMLElement, scripts: string[], onError: (msg: string) => void): Runtime {
  const interp = new Sval({ ecmaVer: "latest", sandBox: true });
  interp.run("exports.__g = globalThis");
  const g = (interp.exports as Record<string, unknown>).__g as Record<string, unknown>;
  delete (interp.exports as Record<string, unknown>).__g;
  lockDown(g);

  const timeouts = new Set<number>(), intervals = new Set<number>(), frames = new Set<number>();
  const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  const readyQueue: Array<() => void> = [];
  let stopped = false;
  const guard = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
    if (stopped) return;
    if (!root.isConnected) { runtime.stop(); return; }
    try { fn(...a); } catch (e) { onError(String(e)); }
  };
  const listen = (target: EventTarget, type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => {
    target.addEventListener(type, fn, opts as AddEventListenerOptions);
    listeners.push([target, type, fn]);
  };
  const createElement = (tag: string) => {
    if (!ALLOWED_TAGS.test(tag)) throw new Error(`<${tag}> is not allowed in html-app`);
    return document.createElement(tag);
  };

  Object.assign(g, {
    document: {
      body: root, documentElement: root, head: root, readyState: "complete",
      getElementById: (id: string) => root.querySelector(`#${CSS.escape(id)}`),
      querySelector: (s: string) => root.querySelector(s),
      querySelectorAll: (s: string) => root.querySelectorAll(s),
      getElementsByClassName: (c: string) => root.getElementsByClassName(c),
      getElementsByTagName: (t: string) => root.getElementsByTagName(t),
      createElement,
      createElementNS: (ns: string, tag: string) => document.createElementNS(ns, tag),
      createTextNode: (t: string) => document.createTextNode(t),
      createDocumentFragment: () => document.createDocumentFragment(),
      addEventListener: (type: string, fn: () => void, opts?: unknown) =>
        type === "DOMContentLoaded" ? readyQueue.push(fn) : listen(root, type, fn, opts),
    },
    addEventListener: (type: string, fn: () => void, opts?: unknown) =>
      type === "load" || type === "DOMContentLoaded" ? readyQueue.push(fn) : listen(root, type, fn, opts),
    setTimeout: (fn: () => void, ms?: number) => { const id = window.setTimeout(guard(() => { timeouts.delete(id); fn(); }), ms); timeouts.add(id); return id; },
    clearTimeout: (id: number) => { window.clearTimeout(id); timeouts.delete(id); },
    setInterval: (fn: () => void, ms?: number) => { const id = window.setInterval(guard(fn), ms); intervals.add(id); return id; },
    clearInterval: (id: number) => { window.clearInterval(id); intervals.delete(id); },
    requestAnimationFrame: (fn: FrameRequestCallback) => { const id = window.requestAnimationFrame(guard((t: number) => { frames.delete(id); fn(t); })); frames.add(id); return id; },
    cancelAnimationFrame: (id: number) => { window.cancelAnimationFrame(id); frames.delete(id); },
    alert: (m: unknown) => onError(`alert: ${String(m)}`),
    getComputedStyle: (e: Element) => window.getComputedStyle(e),
    innerWidth: root.clientWidth, innerHeight: root.clientHeight,
  });

  const runtime: Runtime = {
    stop() {
      stopped = true;
      timeouts.forEach((id) => window.clearTimeout(id));
      intervals.forEach((id) => window.clearInterval(id));
      frames.forEach((id) => window.cancelAnimationFrame(id));
      listeners.forEach(([t, type, fn]) => t.removeEventListener(type, fn));
    },
  };

  root.querySelectorAll("*").forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      if (!attr.name.startsWith("data-ob-on-")) continue;
      const ast = interp.parse(`(function(){ ${attr.value}\n}).call(__obThis)`);
      listen(node, attr.name.slice("data-ob-on-".length), guard((e: Event) => {
        Object.assign(g, { event: e, __obThis: node });
        interp.run(ast);
      }));
    }
  });

  try {
    scripts.forEach((s) => interp.run(s));
    readyQueue.splice(0).forEach((fn) => guard(fn)());
  } catch (e) {
    onError(String(e));
  }
  return runtime;
}

async function renderApp(src: string, sourceButton: HTMLElement): Promise<HTMLElement> {
  const { html, scripts } = prepare(src);
  const frame = el("div", "");
  const area = el("div", "overflow-x:auto;");
  const status = el("div", "display:none;padding:4px 12px;font-size:11px;font-family:var(--vscode-editor-font-family);" +
    "color:var(--vscode-errorForeground,#f48771);border-top:1px solid var(--vscode-widget-border,rgba(128,128,128,0.25));");
  let runtime: Runtime | null = null;
  let root: HTMLElement;

  const mount = () => {
    area.textContent = "";
    const host = el("div", "");
    area.appendChild(host);
    root = mountPreview(host, html);
    root.addEventListener("submit", (e) => e.preventDefault());
    status.style.display = "none";
  };
  const showError = (msg: string) => { status.textContent = `Error: ${msg}`; status.style.display = ""; };

  const runBtn = toolButton("▶ Run", "Run this app's scripts (interpreted, inside the chat)", () => {
    if (runtime) {
      runtime.stop();
      runtime = null;
      mount();
      runBtn.textContent = "▶ Run";
      return;
    }
    runtime = startApp(root, scripts, showError);
    runBtn.textContent = "■ Stop";
  });
  mount();
  frame.append(toolbar([runBtn, sourceButton], true), area, status);
  return frame;
}

export function renderAppBlocks(): void {
  renderFences("html-app", renderApp, "bare");
}
