// Keeps Claude Code's webview patched: re-applies a patcher whenever a Claude update restores the bundle.

import * as fs from "fs";
import * as path from "path";
import type { Patcher } from "./patcher";

const DEBOUNCE_MS = 400;
const BACKSTOP_MS = 45000;

export interface Disposable { dispose(): void; }

// Re-patches when any installed Claude version lacks this patcher's current block; never throws.
export function heal(patcher: Patcher): void {
  try {
    if (patcher.targets().some((p) => patcher.needsPatch(p))) patcher.patch();
  } catch { /* never throw from a watcher */ }
}

// Watches each Claude webview dir and re-heals on index.js changes, plus a periodic backstop.
export function watchBundles(patcher: Patcher): Disposable[] {
  const disposables: Disposable[] = [];
  let timer: NodeJS.Timeout | null = null;
  const debounced = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => heal(patcher), DEBOUNCE_MS); };

  for (const dir of new Set(patcher.targets().map((p) => path.dirname(p)))) {
    try {
      const w = fs.watch(dir, (_evt, filename) => { if (filename === "index.js") debounced(); });
      disposables.push({ dispose: () => { try { w.close(); } catch { /* already closed */ } } });
    } catch { /* watching is best-effort */ }
  }

  const backstop = setInterval(() => heal(patcher), BACKSTOP_MS);
  disposables.push({ dispose: () => clearInterval(backstop) });
  return disposables;
}
