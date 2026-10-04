// Public webview API: the rich-reply renderers as ticker steps, plus the ticker and fence helpers.

import { renderMermaidBlocks } from "./mermaidBlocks";
import { renderChartBlocks } from "./chartBlocks";
import { renderMathBlocks } from "./mathBlocks";
import { renderHtmlBlocks } from "./htmlBlocks";
import { renderAppBlocks } from "./appBlocks";
import type { Step } from "./ticker";

export const richReplySteps: Step[] = [
  ["mermaid", renderMermaidBlocks], ["chart", renderChartBlocks], ["math", renderMathBlocks],
  ["html", renderHtmlBlocks], ["app", renderAppBlocks],
];

export { startTicker } from "./ticker";
export type { Step } from "./ticker";
export { renderFences, el, toolButton, toolbar, openFullWindow, isLightTheme } from "./fenceBlocks";
export type { FenceRenderer } from "./fenceBlocks";
