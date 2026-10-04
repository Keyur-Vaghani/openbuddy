// Standalone OpenBuddy script appended to Claude Code's webview/index.js; renders rich-reply fences.

import { richReplySteps, startTicker } from "./index";

const w = window as unknown as { __OPENBUDDY_LOADED__?: boolean; IS_SESSION_LIST_ONLY?: boolean };

if (!w.__OPENBUDDY_LOADED__ && w.IS_SESSION_LIST_ONLY !== true) {
  w.__OPENBUDDY_LOADED__ = true;
  startTicker(richReplySteps, "OpenBuddy");
}
