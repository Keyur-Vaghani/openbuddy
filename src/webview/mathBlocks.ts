// Renders ```math fences and $…$ / $$…$$ in reply prose as MathML (KaTeX fonts are blocked by the webview's font-src).
import katex from "katex";
import { el, renderFences, toolbar } from "./fenceBlocks";

const DISPLAY_RE = /\$\$([\s\S]+?)\$\$/;
const INLINE_RE = /\$(?![\s$])([^$\n]+?)(?<!\s)\$(?!\d)/;
const SKIP_SEL = "pre, code, math, [data-ob-fence-view], [data-ob-math]";
const lastSeen = new WeakMap<Text, string>();
const done = new WeakSet<Text>();

function ensureStyle(): void {
  if (document.querySelector("style[data-ob-math-style]")) return;
  const s = document.createElement("style");
  s.setAttribute("data-ob-math-style", "1");
  s.textContent = 'math{font-family:"STIX Two Math","Latin Modern Math","Cambria Math",math;font-size:1.12em;}' +
    "[data-ob-math=block]{display:block;margin:4px 0;padding:.45em 0;overflow-x:auto;overflow-y:hidden;}" +
    // KaTeX wraps block <math> in an inline span; block-in-inline mis-sizes the box and clips the top line.
    "[data-ob-math=block]>.katex{display:block;}";
  document.head.appendChild(s);
}

function toMath(tex: string, displayMode: boolean): HTMLElement {
  const span = el("span", "");
  span.setAttribute("data-ob-math", displayMode ? "block" : "inline");
  span.title = tex;
  span.innerHTML = katex.renderToString(tex, { output: "mathml", displayMode, throwOnError: false, strict: "ignore" });
  return span;
}

async function renderMathFence(src: string, sourceButton: HTMLElement): Promise<HTMLElement> {
  ensureStyle();
  const frame = el("div", "");
  for (const part of src.split(/\n\s*\n/)) if (part.trim()) frame.appendChild(toMath(part.trim(), true));
  frame.appendChild(toolbar([sourceButton]));
  return frame;
}

function nextMatch(text: string): { index: number; length: number; tex: string; display: boolean } | null {
  const d = DISPLAY_RE.exec(text);
  const i = INLINE_RE.exec(text);
  if (d && (!i || d.index <= i.index)) return { index: d.index, length: d[0].length, tex: d[1].trim(), display: true };
  if (i) return { index: i.index, length: i[0].length, tex: i[1], display: false };
  return null;
}

// Keeps React's text node in place (trimmed to the leading text) so React can still update or remove it safely.
function replaceInTextNode(node: Text): void {
  const text = node.nodeValue ?? "";
  if (!nextMatch(text)) { done.add(node); return; }
  ensureStyle();
  const frag = document.createDocumentFragment();
  let rest = text;
  let head: string | null = null;
  for (let m = nextMatch(rest); m; m = nextMatch(rest)) {
    const before = rest.slice(0, m.index);
    if (head === null) head = before;
    else if (before) frag.appendChild(markDone(document.createTextNode(before)));
    frag.appendChild(toMath(m.tex, m.display));
    rest = rest.slice(m.index + m.length);
  }
  if (rest) frag.appendChild(markDone(document.createTextNode(rest)));
  node.nodeValue = head ?? "";
  done.add(node);
  node.parentNode?.insertBefore(frag, node.nextSibling);
}

function markDone(t: Text): Text {
  done.add(t);
  return t;
}

// Prose text nodes are converted only once unchanged across two ticks, so a streaming reply isn't rewritten mid-flight.
function renderProseMath(): void {
  document.querySelectorAll('[data-testid="assistant-message"]').forEach((msg) => {
    const walker = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT);
    const ready: Text[] = [];
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (done.has(n)) continue;
      const v = n.nodeValue ?? "";
      if (!v.includes("$") || n.parentElement?.closest(SKIP_SEL)) continue;
      if (lastSeen.get(n) !== v) { lastSeen.set(n, v); continue; }
      ready.push(n);
    }
    ready.forEach(replaceInTextNode);
  });
}

export function renderMathBlocks(): void {
  renderFences("math", renderMathFence, "bare");
  renderProseMath();
}
