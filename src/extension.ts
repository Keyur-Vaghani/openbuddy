// VS Code entry point: patches Claude Code's chat webview with OpenBuddy and keeps it patched.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { createPatcher, watchBundles, type Patcher } from "./host";
import { installSkill, removeSkill, skillFile } from "./skill";

const RELOAD = "Reload Window";
const CLAUDE_CODE_ID = "anthropic.claude-code";

// Patches only the extensions dir this VS Code actually loaded Claude Code from (Insiders, Cursor, custom dirs).
function createOpenBuddyPatcher(): Patcher {
  const claude = vscode.extensions.getExtension(CLAUDE_CODE_ID);
  return createPatcher({
    id: "OPENBUDDY",
    injectedPath: path.join(__dirname, "injected.js"),
    extensionsDir: claude ? path.dirname(claude.extensionPath) : undefined,
  });
}

// Offers a window reload so a patch change takes effect.
function promptReload(message: string): void {
  vscode.window.showInformationMessage(message, RELOAD).then((pick) => {
    if (pick === RELOAD) vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}

// Patches on activate, prompting a reload only when a bundle was not already patched.
function install(patcher: Patcher): void {
  try {
    const needed = patcher.status().some((s) => !s.patched);
    const res = patcher.patch();
    if (res.patched.length && needed) promptReload("OpenBuddy installed. Reload the window to render rich replies.");
  } catch (e) {
    console.error("[openbuddy] patch failed", e);
  }
}

const readInstructions = (extensionPath: string) => fs.readFileSync(path.join(extensionPath, "docs", "claude-instructions.md"), "utf8");

// Installs (or refreshes) the Claude skill so Claude knows the fences without any setup from the user.
function teachClaude(extensionPath: string): void {
  try {
    const result = installSkill(readInstructions(extensionPath));
    if (result === "installed") {
      vscode.window.showInformationMessage("OpenBuddy is ready. Start a new Claude chat and ask it to draw something, e.g. \"show how login works as a diagram\".");
    } else if (result === "userOwned") {
      console.warn(`[openbuddy] ${skillFile()} exists and was not written by OpenBuddy; leaving it as is`);
    }
  } catch (e) {
    console.error("[openbuddy] skill install failed", e);
  }
}

// Copies the same instructions for anyone who wants them always on, in a CLAUDE.md.
async function copyInstructions(extensionPath: string): Promise<void> {
  await vscode.env.clipboard.writeText(readInstructions(extensionPath));
  vscode.window.showInformationMessage("OpenBuddy instructions copied. Paste them into a CLAUDE.md to have them in every chat.");
}

export function activate(context: vscode.ExtensionContext): void {
  const patcher = createOpenBuddyPatcher();
  install(patcher);
  teachClaude(context.extensionPath);
  for (const d of watchBundles(patcher)) context.subscriptions.push(d);

  context.subscriptions.push(
    vscode.commands.registerCommand("openbuddy.apply", () => {
      const res = patcher.patch();
      teachClaude(context.extensionPath);
      promptReload(`OpenBuddy applied to ${res.patched.length} Claude version(s). Reload the window.`);
    }),
    vscode.commands.registerCommand("openbuddy.remove", () => {
      const restored = patcher.unpatch();
      removeSkill();
      promptReload(`OpenBuddy removed from ${restored.length} Claude version(s) and its Claude skill deleted. Reload the window.`);
    }),
    vscode.commands.registerCommand("openbuddy.copyInstructions", () => copyInstructions(context.extensionPath)),
  );
}

export function deactivate(): void { /* subscriptions dispose the watchers */ }
