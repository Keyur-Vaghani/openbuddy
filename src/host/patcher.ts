// Appends a product's built webview script to Claude Code's webview/index.js, idempotently and reversibly.
// Blocks are fenced by /*<ID>-START*/ … /*<ID>-END*/ and stamped with a content hash so stale copies get replaced.

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as vm from "vm";

const DEFAULT_EXTENSIONS_DIR = path.join(os.homedir(), ".vscode", "extensions");

// An extra in-place change to Claude's bundle, applied after stripping and reverted on unpatch.
export interface BundleEdit {
  apply(src: string): string;
  revert(src: string): string;
  needed(src: string): boolean;
  present(src: string): boolean;
}

// id names the markers; injectedPath is the built IIFE appended to each bundle.
export interface PatcherOptions {
  id: string;
  injectedPath: string;
  extensionsDir?: string;
  edits?: BundleEdit[];
}

export interface PatchResult { patched: string[]; skipped: string[]; }

export interface Patcher {
  targets(): string[];
  patch(): PatchResult;
  unpatch(): string[];
  status(): { path: string; patched: boolean }[];
  needsPatch(file: string): boolean;
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// webview/index.js for every Claude Code version installed in extensionsDir.
export function claudeWebviewBundles(extensionsDir = DEFAULT_EXTENSIONS_DIR): string[] {
  try {
    return fs.readdirSync(extensionsDir)
      .filter((n) => n.startsWith("anthropic.claude-code-"))
      .map((n) => path.join(extensionsDir, n, "webview", "index.js"))
      .filter((p) => fs.existsSync(p));
  } catch { return []; }
}

function parses(src: string): boolean {
  try { new vm.Script(src); return true; } catch { return false; }
}

// Writes only a bundle that compiles, via temp+rename so concurrent windows never read it half-written.
function writeBundle(file: string, src: string): void {
  if (!parses(src)) throw new Error("refusing to write an unparseable bundle: " + file);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, src);
  fs.renameSync(tmp, file);
}

// Builds a patcher whose markers, injected script and bundle edits all belong to one product.
export function createPatcher({ id, injectedPath, extensionsDir, edits = [] }: PatcherOptions): Patcher {
  const targets = () => claudeWebviewBundles(extensionsDir);
  const markStart = `/*${id}-START*/`;
  const markEnd = `/*${id}-END*/`;
  const blockRe = new RegExp("\\n?;?\\s*" + escapeRe(markStart) + "[\\s\\S]*?" + escapeRe(markEnd) + "\\n?", "g");

  const injected = () => fs.readFileSync(injectedPath, "utf8");
  const versionTag = () => `/*${id}V:` + crypto.createHash("md5").update(injected()).digest("hex").slice(0, 8) + "*/";
  const strip = (src: string) => src.replace(blockRe, "");
  const isPatched = (src: string) => src.includes(markStart);
  // Leading ";" guards against ASI if the bundle ends mid-expression.
  const block = () => "\n;" + markStart + versionTag() + "\n" + injected() + "\n" + markEnd + "\n";

  function patch(): PatchResult {
    const appended = block();
    const result: PatchResult = { patched: [], skipped: [] };
    for (const file of targets()) {
      try {
        const src = fs.readFileSync(file, "utf8");
        const next = edits.reduce((s, e) => e.apply(s), strip(src)) + appended;
        if (next !== src) writeBundle(file, next);
        result.patched.push(file);
      } catch { result.skipped.push(file); }
    }
    return result;
  }

  function unpatch(): string[] {
    const restored: string[] = [];
    for (const file of targets()) {
      try {
        const src = fs.readFileSync(file, "utf8");
        if (!isPatched(src) && !edits.some((e) => e.present(src))) continue;
        writeBundle(file, edits.reduce((s, e) => e.revert(s), strip(src)));
        restored.push(file);
      } catch { /* a locked or vanished bundle stays as it is */ }
    }
    return restored;
  }

  function status(): { path: string; patched: boolean }[] {
    return targets().map((p) => {
      let patched = false;
      try { patched = isPatched(fs.readFileSync(p, "utf8")); } catch { /* unreadable counts as unpatched */ }
      return { path: p, patched };
    });
  }

  function needsPatch(file: string): boolean {
    try {
      const src = fs.readFileSync(file, "utf8");
      return !src.includes(versionTag()) || edits.some((e) => e.needed(src));
    } catch { return false; }
  }

  return { targets, patch, unpatch, status, needsPatch };
}
