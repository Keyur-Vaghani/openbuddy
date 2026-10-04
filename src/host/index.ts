// Public host API: patch Claude Code's chat webview with a product's script and keep it patched.

export { createPatcher, claudeWebviewBundles } from "./patcher";
export type { BundleEdit, Patcher, PatcherOptions, PatchResult } from "./patcher";
export { heal, watchBundles } from "./selfHeal";
export type { Disposable } from "./selfHeal";
