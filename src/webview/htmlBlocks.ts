// Renders ```html-preview fences as sanitized, script-free HTML in a shadow root so its CSS can't leak into the chat.
import DOMPurify from "dompurify";
import { el, openFullWindow, renderFences, toolbar, toolButton } from "./fenceBlocks";

declare const __OPENBUDDY_PREVIEW_CSS__: string;

const PURIFY = {
  FORCE_BODY: true,
  ADD_TAGS: ["style"],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "base", "meta", "link"],
  FORBID_ATTR: ["action", "formaction", "srcdoc"],
};

// Shadow content has no <html>/<body>, so page-level selectors are pointed at our root instead.
function retargetPageSelectors(css: string): string {
  return css.replace(/(^|[\s,}>~+])(html|body|:root)(?=[\s,{.:#[>~+])/g, "$1.ob-root");
}

export function sanitizeDoc(doc: Document, purify: object = PURIFY): string {
  const styles = Array.from(doc.querySelectorAll("style")).map((s) => s.textContent ?? "");
  doc.querySelectorAll("style").forEach((s) => s.remove());
  const css = styles.length ? `<style>${retargetPageSelectors(styles.join("\n"))}</style>` : "";
  return DOMPurify.sanitize(css + doc.body.innerHTML, purify) as string;
}

function sanitize(src: string): string {
  return sanitizeDoc(new DOMParser().parseFromString(src, "text/html"));
}

export function mountPreview(host: HTMLElement, html: string): HTMLElement {
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>:host{display:block}img{max-width:100%}${retargetPageSelectors(__OPENBUDDY_PREVIEW_CSS__)}` +
    `</style><div class="ob-root">${html}</div>`;
  root.addEventListener("click", (e) => {
    if ((e.target as Element | null)?.closest?.("a[href]")) e.preventDefault();
  });
  return root.querySelector(".ob-root") as HTMLElement;
}

async function renderHtml(src: string, sourceButton: HTMLElement): Promise<HTMLElement> {
  const html = sanitize(src);
  const frame = el("div", "");
  const area = el("div", "overflow-x:auto;");
  const host = el("div", "");
  mountPreview(host, html);
  area.appendChild(host);
  const fullBtn = toolButton("⤢", "Open full window", () => openFullWindow((close) => {
    const f = el("div", "display:flex;flex-direction:column;height:100%;");
    const a = el("div", "flex:1;overflow:auto;padding:16px;min-height:0;");
    const h = el("div", "");
    mountPreview(h, html);
    a.appendChild(h);
    f.append(toolbar([toolButton("✕", "Close (Esc)", close)]), a);
    return f;
  }));
  frame.append(toolbar([fullBtn, sourceButton]), area);
  return frame;
}

export function renderHtmlBlocks(): void {
  renderFences("html-preview", renderHtml, "bare");
}
