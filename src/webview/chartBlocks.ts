// Renders ```chart fences (Chart.js config as JSON) with the dataviz reference palette, tooltips and a table view.
import { Chart, registerables, type ChartConfiguration, type Plugin } from "chart.js";
import { el, isLightTheme, openFullWindow, renderFences, toolbar, toolButton } from "./fenceBlocks";

Chart.register(...registerables);

const PALETTE_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const PALETTE_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const PER_POINT_TYPES = new Set(["pie", "doughnut", "polarArea"]);
const INLINE_HEIGHT = 280;

type Json = Record<string, unknown>;
type ChartSpec = { type: string; data: { labels?: unknown[]; datasets: Json[] }; options?: Json };

function isObj(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function merge(base: Json, over: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k] as Json, v) : v;
  return out;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

const crosshair: Plugin = {
  id: "obCrosshair",
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active?.length || (chart.config as { type?: string }).type !== "line") return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = cssVar("--vscode-descriptionForeground", "#888");
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

function styleDatasets(spec: ChartSpec, palette: string[], surface: string): Json[] {
  const perPoint = PER_POINT_TYPES.has(spec.type);
  return spec.data.datasets.map((ds, i) => {
    const kind = (ds.type as string | undefined) ?? spec.type;
    const color = palette[i % palette.length];
    if (perPoint) {
      const n = spec.data.labels?.length ?? (ds.data as unknown[] | undefined)?.length ?? 0;
      return { backgroundColor: palette.slice(0, n), borderColor: surface, borderWidth: 2, hoverOffset: 4, ...ds };
    }
    if (kind === "bar") return { backgroundColor: color, borderRadius: 4, borderSkipped: "start", borderWidth: 0, ...ds };
    if (kind === "line") {
      return { borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
        pointHitRadius: 10, tension: 0, ...ds };
    }
    return { borderColor: color, backgroundColor: color, pointRadius: 4, pointHoverRadius: 6, ...ds };
  });
}

// Claude Code's own --app-chart-N series colours, falling back per slot to the reference palette.
function hostPalette(): string[] {
  const fallback = isLightTheme() ? PALETTE_LIGHT : PALETTE_DARK;
  const probe = el("span", "display:none;");
  document.body.appendChild(probe);
  const palette = fallback.map((color, i) => {
    probe.style.color = "";
    probe.style.color = `var(--app-chart-${i + 1})`;
    // The computed colour resolves var() and rgb(from …) syntax that a canvas fillStyle may reject.
    const resolved = getComputedStyle(probe).color;
    return cssVar(`--app-chart-${i + 1}`, "") && resolved !== "rgba(0, 0, 0, 0)" ? resolved : color;
  });
  probe.remove();
  return palette;
}

function buildConfig(spec: ChartSpec): ChartConfiguration {
  const palette = hostPalette();
  const fg = cssVar("--vscode-foreground", "#ccc");
  const muted = cssVar("--vscode-descriptionForeground", "#999");
  const surface = cssVar("--vscode-editor-background", "#1e1e1e");
  const grid = "rgba(128,128,128,0.15)";
  const perPoint = PER_POINT_TYPES.has(spec.type);
  const multi = spec.data.datasets.length >= 2 || perPoint;
  const axis = (gridOn: boolean) => ({ grid: { display: gridOn, color: grid }, border: { display: false }, ticks: { color: muted } });

  const defaults: Json = {
    responsive: true,
    maintainAspectRatio: false,
    color: fg,
    font: { family: cssVar("--vscode-font-family", "sans-serif") },
    interaction: spec.type === "line" ? { mode: "index", intersect: false } : { mode: "nearest", intersect: true },
    plugins: {
      legend: { display: multi, position: "top", align: "start", labels: { color: fg, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      title: { color: fg },
      tooltip: { backgroundColor: cssVar("--vscode-editorHoverWidget-background", "#252526"), titleColor: fg, bodyColor: fg,
        borderColor: cssVar("--vscode-editorHoverWidget-border", "#454545"), borderWidth: 1, boxPadding: 4 },
    },
    ...(perPoint ? {} : { scales: { x: axis(spec.type !== "bar"), y: axis(true) } }),
  };
  return {
    type: spec.type,
    data: { ...spec.data, datasets: styleDatasets(spec, palette, surface) },
    options: merge(defaults, spec.options ?? {}),
    plugins: [crosshair],
  } as unknown as ChartConfiguration;
}

function buildTable(spec: ChartSpec): HTMLElement {
  const wrap = el("div", "overflow:auto;padding:8px 10px;max-height:" + INLINE_HEIGHT + "px;");
  const table = el("table", "border-collapse:collapse;font-size:12px;width:100%;color:var(--vscode-foreground);");
  const cell = (tag: string, text: string, right: boolean) =>
    el(tag, `padding:3px 8px;border-bottom:1px solid rgba(128,128,128,0.2);text-align:${right ? "right" : "left"};`, text);
  const head = el("tr", "");
  head.append(cell("th", "", false), ...spec.data.datasets.map((d, i) => cell("th", String(d.label ?? `Series ${i + 1}`), true)));
  table.appendChild(head);
  const rows = Math.max(spec.data.labels?.length ?? 0, ...spec.data.datasets.map((d) => (d.data as unknown[]).length));
  for (let r = 0; r < rows; r++) {
    const tr = el("tr", "");
    tr.append(cell("td", String(spec.data.labels?.[r] ?? r + 1), false),
      ...spec.data.datasets.map((d) => {
        const v = (d.data as unknown[])[r];
        return cell("td", isObj(v) ? JSON.stringify(v) : String(v ?? ""), true);
      }));
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  return wrap;
}

function parseSpec(src: string): ChartSpec {
  const spec = JSON.parse(src) as ChartSpec;
  if (!spec || typeof spec.type !== "string" || !Array.isArray(spec.data?.datasets)) {
    throw new Error("chart fence needs {type, data: {labels?, datasets: [...]}, options?}");
  }
  return spec;
}

async function renderChart(src: string, sourceButton: HTMLElement): Promise<HTMLElement> {
  const spec = parseSpec(src);
  const frame = el("div", "display:flex;flex-direction:column;");
  const area = el("div", `position:relative;height:${INLINE_HEIGHT}px;padding:8px 10px;box-sizing:border-box;`);
  const canvas = document.createElement("canvas");
  area.appendChild(canvas);
  const table = buildTable(spec);
  table.style.display = "none";
  new Chart(canvas, buildConfig(spec));

  const tableBtn = toolButton("table", "Show the data as a table", () => {
    const showTable = table.style.display === "none";
    table.style.display = showTable ? "" : "none";
    area.style.display = showTable ? "none" : "";
    tableBtn.textContent = showTable ? "chart" : "table";
  });
  const fullBtn = toolButton("⤢", "Open full window", () => {
    let big: Chart | null = null;
    openFullWindow((close) => {
      const f = el("div", "display:flex;flex-direction:column;height:100%;");
      const a = el("div", "position:relative;flex:1;padding:16px;box-sizing:border-box;min-height:0;");
      const c = document.createElement("canvas");
      a.appendChild(c);
      f.append(toolbar([toolButton("✕", "Close (Esc)", close)]), a);
      requestAnimationFrame(() => { big = new Chart(c, buildConfig(spec)); });
      return f;
    }, () => big?.destroy());
  });
  frame.append(toolbar([tableBtn, fullBtn, sourceButton]), area, table);
  return frame;
}

export function renderChartBlocks(): void {
  renderFences("chart", renderChart);
}
