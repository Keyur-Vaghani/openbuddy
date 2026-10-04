// Renders ```mermaid fences as a pan/zoom diagram.
import mermaid from "mermaid";
import { el, isLightTheme, openFullWindow, renderFences, toolbar, toolButton } from "./fenceBlocks";

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
let seq = 0;
let initedTheme: string | null = null;

function ensureInit(): void {
  const t = isLightTheme() ? "default" : "dark";
  if (initedTheme === t) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: t });
  initedTheme = t;
}

interface PanZoom { zoomBy(factor: number): void; reset(): void; }

function attachPanZoom(viewport: HTMLElement, stage: HTMLElement, onChange: (scale: number) => void): PanZoom {
  let scale = 1, x = 0, y = 0;
  const apply = () => { stage.style.transform = `translate(${x}px,${y}px) scale(${scale})`; onChange(scale); };

  function zoomAt(factor: number, cx: number, cy: number): void {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    x = cx - (cx - x) * (next / scale);
    y = cy - (cy - y) * (next / scale);
    scale = next;
    apply();
  }

  viewport.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  let drag: { px: number; py: number; x: number; y: number } | null = null;
  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { px: e.clientX, py: e.clientY, x, y };
    viewport.setPointerCapture(e.pointerId);
    viewport.style.cursor = "grabbing";
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!drag) return;
    x = drag.x + e.clientX - drag.px;
    y = drag.y + e.clientY - drag.py;
    apply();
  });
  const endDrag = () => { drag = null; viewport.style.cursor = "grab"; };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  const api: PanZoom = {
    zoomBy: (f) => zoomAt(f, viewport.clientWidth / 2, viewport.clientHeight / 2),
    reset: () => { scale = 1; x = 0; y = 0; apply(); },
  };
  viewport.addEventListener("dblclick", api.reset);
  apply();
  return api;
}

function buildDiagramFrame(svg: string, fullWindow: boolean, extraButtons: HTMLElement[]): HTMLElement {
  const frame = el("div", "position:relative;display:flex;flex-direction:column;" + (fullWindow ? "height:100%;" : ""));
  const viewport = el("div", "overflow:hidden;cursor:grab;touch-action:none;user-select:none;" +
    (fullWindow ? "flex:1;" : ""));
  const stage = el("div", "transform-origin:0 0;padding:10px;" + (fullWindow ? "display:flex;justify-content:center;" : ""));
  stage.innerHTML = svg;
  viewport.appendChild(stage);

  const pct = el("span", "font-size:10px;opacity:0.6;min-width:34px;text-align:center;color:var(--vscode-foreground);");
  const pz = attachPanZoom(viewport, stage, (s) => { pct.textContent = `${Math.round(s * 100)}%`; });
  frame.append(toolbar([
    toolButton("−", "Zoom out (⌘/Ctrl + scroll)", () => pz.zoomBy(1 / 1.25)),
    pct,
    toolButton("+", "Zoom in (⌘/Ctrl + scroll)", () => pz.zoomBy(1.25)),
    toolButton("⟲", "Reset (double-click)", pz.reset),
    ...extraButtons,
  ]), viewport);
  // Tracks the stage's layout height (transforms don't affect it), so a wider chat never clips the diagram.
  if (!fullWindow) new ResizeObserver(() => { viewport.style.height = `${stage.offsetHeight}px`; }).observe(stage);
  return frame;
}

async function renderMermaid(src: string, sourceButton: HTMLElement): Promise<HTMLElement> {
  ensureInit();
  await mermaid.parse(src);
  const { svg } = await mermaid.render(`ob-mermaid-${++seq}`, src);
  return buildDiagramFrame(svg, false, [
    toolButton("⤢", "Open full window", () => openFullWindow((close) =>
      buildDiagramFrame(svg, true, [toolButton("✕", "Close (Esc)", close)]))),
    sourceButton,
  ]);
}

export function renderMermaidBlocks(): void {
  renderFences("mermaid", renderMermaid);
}
