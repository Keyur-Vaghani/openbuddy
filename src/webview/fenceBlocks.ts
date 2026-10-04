// Shared plumbing for rendering fenced code blocks in Claude's replies (mermaid, chart, html…) beside the hidden source.

const lastSeen = new WeakMap<Element, string>();

export function el(tag: string, css: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function isLightTheme(): boolean {
  const c = document.body.classList;
  return c.contains("vscode-light") || c.contains("vscode-high-contrast-light");
}

export function toolButton(label: string, title: string, onClick: () => void): HTMLElement {
  const b = el("button", "all:unset;cursor:pointer;min-width:18px;text-align:center;padding:1px 5px;font-size:11px;" +
    "border-radius:3px;color:var(--vscode-foreground);opacity:0.75;", label);
  (b as HTMLButtonElement).type = "button";
  b.title = title;
  b.addEventListener("mouseenter", () => { b.style.opacity = "1"; b.style.background = "var(--vscode-toolbar-hoverBackground,rgba(128,128,128,0.2))"; });
  b.addEventListener("mouseleave", () => { b.style.opacity = "0.75"; b.style.background = ""; });
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
}

// Inside a fence view the bar floats top-right and shows on hover, like Claude Code's copy button.
const FENCE_CSS =
  "[data-ob-toolbar]{display:flex;align-items:center;gap:2px;justify-content:flex-end;padding:2px 4px;" +
  "border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,0.25));}" +
  "[data-ob-fence-view]{position:relative;margin:8px 0;}" +
  "[data-ob-frame=panel]{background:var(--app-code-background,var(--vscode-textCodeBlock-background,rgba(127,127,127,0.15)));" +
  "border-radius:4px;}" +
  "[data-ob-fence-view] [data-ob-toolbar]{position:absolute;top:4px;right:4px;z-index:2;padding:1px 2px;opacity:0;" +
  "transition:opacity .15s;border:1px solid var(--app-input-border,var(--vscode-widget-border,rgba(128,128,128,0.4)));" +
  "border-radius:4px;background:var(--app-secondary-background,var(--vscode-editor-background));}" +
  "[data-ob-fence-view]:hover [data-ob-toolbar],[data-ob-fence-view]:focus-within [data-ob-toolbar]{opacity:1;}" +
  "[data-ob-fence-view] [data-ob-toolbar=pinned]{position:static;opacity:1;border:0;background:none;padding:0 0 4px;}";

function ensureFenceStyle(): void {
  if (document.querySelector("style[data-ob-fence-style]")) return;
  const s = document.createElement("style");
  s.setAttribute("data-ob-fence-style", "1");
  s.textContent = FENCE_CSS;
  document.head.appendChild(s);
}

// A pinned bar stays visible without hover, for views whose primary action lives there.
export function toolbar(buttons: HTMLElement[], pinned = false): HTMLElement {
  ensureFenceStyle();
  const bar = el("div", "");
  bar.setAttribute("data-ob-toolbar", pinned ? "pinned" : "");
  bar.append(...buttons);
  return bar;
}

export function openFullWindow(build: (close: () => void) => HTMLElement, onClose?: () => void): void {
  const back = el("div", "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.55);display:flex;" +
    "align-items:center;justify-content:center;");
  const modal = el("div", "width:94vw;height:90vh;background:var(--vscode-editor-background,#1e1e1e);" +
    "border:1px solid var(--vscode-widget-border,#444);border-radius:8px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.55);");
  const close = () => { back.remove(); document.removeEventListener("keydown", onEsc); onClose?.(); };
  const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  modal.appendChild(build(close));
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  document.addEventListener("keydown", onEsc);
  back.appendChild(modal);
  document.body.appendChild(back);
}

export type FenceRenderer = (src: string, sourceButton: HTMLElement) => Promise<HTMLElement>;

// "panel" sits on a code-block surface; "bare" flows straight into the reply like prose.
export type FenceFrame = "panel" | "bare";

async function renderOne(code: Element, src: string, lang: string, render: FenceRenderer, frame: FenceFrame): Promise<void> {
  const wrapper = code.closest('[class*="codeBlockWrapper_"]') as HTMLElement | null;
  if (!wrapper || !wrapper.parentNode) return;
  code.setAttribute("data-ob-fence", "pending");
  let box: HTMLElement | null = null;
  const backBtn = toolButton(`◂ ${lang}`, "Back to the rendered view", () => {
    backBtn.remove();
    wrapper.style.display = "none";
    if (box) box.style.display = "";
  });
  const sourceBtn = toolButton("source", `Show the ${lang} source`, () => {
    wrapper.style.display = "";
    if (box) box.style.display = "none";
    wrapper.parentNode?.insertBefore(backBtn, wrapper);
  });
  try {
    const view = await render(src, sourceBtn);
    ensureFenceStyle();
    box = el("div", "");
    box.setAttribute("data-ob-fence-view", lang);
    box.setAttribute("data-ob-frame", frame);
    box.appendChild(view);
    wrapper.parentNode.insertBefore(box, wrapper.nextSibling);
    wrapper.style.display = "none";
    code.setAttribute("data-ob-fence", "done");
  } catch (err) {
    code.setAttribute("data-ob-fence", "error");
    console.warn(`[OpenBuddy] ${lang} render failed`, err);
  }
}

// Renders a block only once its text is unchanged across two ticks, so a streaming fence isn't parsed half-written.
export function renderFences(lang: string, render: FenceRenderer, frame: FenceFrame = "panel"): void {
  document.querySelectorAll(`pre > code.language-${lang}`).forEach((code) => {
    if (code.hasAttribute("data-ob-fence")) return;
    const src = code.textContent ?? "";
    if (!src.trim()) return;
    if (lastSeen.get(code) !== src) { lastSeen.set(code, src); return; }
    void renderOne(code, src, lang, render, frame);
  });
}
