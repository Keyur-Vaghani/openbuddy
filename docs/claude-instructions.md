## Rich replies (OpenBuddy)

This VS Code chat has OpenBuddy installed: these fenced blocks render as live views inside your reply, each
with a **source** toggle back to the code. Use one when it beats prose — a flow, a comparison of numbers,
a formula, a small widget — not as decoration. One visual per point; keep the prose that states the conclusion.

| Fence | Body | Renders as |
|---|---|---|
| `mermaid` | Mermaid source (flowchart, sequenceDiagram, stateDiagram, erDiagram, gantt, …) | SVG with zoom, pan, full window |
| `chart` | Chart.js config as **JSON**: `{"type", "data": {"labels", "datasets"}, "options"?}` | Chart with tooltips and a table view |
| `math` | Display TeX; a blank line separates equations | MathML |
| `html-preview` | Static HTML + `<style>` | Sanitized, style-isolated preview |
| `html-app` | HTML + inline `<script>` / `on*` handlers | Static until the user presses **▶ Run**, then interpreted JS |

**chart** — strict JSON: no functions (tick formatters, callbacks) and no comments. Leave colors out; a
light/dark palette is applied automatically. One y-axis per chart; two measures of different scale → two charts.

**math** — use the fence for anything with `\\`, `\{`, `\,`, matrices or `aligned`. Inline `$…$` / `$$…$$` in
prose works only for simple TeX; `\(…\)` and `\[…\]` never render.

**html-preview / html-app** — rendered inline in the reply, in the chat's own font and theme colours, at full
height (no inner scrolling). A design system is built in, so these need no `<style>`:

| Class | Markup |
|---|---|
| `.hero` | `<div class="hero"><div class="eyebrow">Area</div><h2>Title</h2><p class="sub">…</p></div>` |
| `.tiles` / `.tile` | `<div class="tiles"><div class="tile"><b>90%</b><span>Hit rate</span></div>…</div>` |
| `.card` (+ `ok` `warn` `crit` `accent`) | `<div class="card ok"><h3>Title</h3><p>…</p></div>` — status colours the heading |
| `.pill` / `.state` (+ status) | `<span class="pill ok">Healthy</span>` |
| `.callout` (+ `warn` `crit`) | `<div class="callout"><b>Note:</b> …</div>` |
| `table.data` | header row of `<th>`; `<td class="n">` right-aligns numbers |
| `.meter` | `<div class="meter"><span style="width:60%"></span></div>` |
| `ol.plan` | `<ol class="plan"><li><b>Step</b> detail</li>…</ol>` |
| `.legend` | `<div class="legend"><span><i class="swatch" style="background:…"></i>Label</span></div>` |

Colours come from the VS Code theme, so don't hard-code them unless the colour carries meaning. `body`/`html`/`:root`
rules apply to the preview, never the chat. Not available: `<link>`, web fonts, remote images (only `data:`),
iframes, navigation. Plain ```` ```html ```` stays as code.

**html-app only** — the script runs in an interpreter: keep it small (counters, toggles, forms, small canvas
animations). `document` is the widget; `fetch`, storage, `location`, `WebSocket`, `Worker` and `Function` are
undefined. Timers, animation frames and listeners are cleared on Stop. Never write an unbounded loop — it
freezes the chat. Size a canvas from its CSS box (`cv.width = cv.clientWidth`).
