// Installs the Claude Code skill that teaches Claude which fenced blocks OpenBuddy renders, so users paste nothing.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const MARKER = "<!-- installed by the OpenBuddy VS Code extension; removed when it is uninstalled -->";

const FRONTMATTER = `---
name: openbuddy
description: Render diagrams, charts, math, styled status cards and small runnable widgets inline in a Claude Code VS Code chat reply, via OpenBuddy's fenced blocks (mermaid, chart, math, html-preview, html-app). Use whenever a reply would be clearer as a flow or sequence diagram, a chart of numbers, an equation, a status card or table, or a small interactive tool, instead of ASCII art or long prose. Only for the VS Code chat; in the terminal these blocks show as raw code.
---`;

export type SkillResult = "installed" | "updated" | "unchanged" | "userOwned";

// Claude Code reads skills from $CLAUDE_CONFIG_DIR (default ~/.claude)/skills/<name>/SKILL.md.
export function skillFile(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return path.join(configDir, "skills", "openbuddy", "SKILL.md");
}

export function skillContent(instructions: string): string {
  return `${FRONTMATTER}\n${MARKER}\n\n${instructions.trim()}\n`;
}

// Writes or refreshes the skill; leaves a same-named skill the user wrote themselves untouched.
export function installSkill(instructions: string, file = skillFile()): SkillResult {
  const content = skillContent(instructions);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (existing === content) return "unchanged";
  if (existing !== null && !existing.includes(MARKER)) return "userOwned";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return existing === null ? "installed" : "updated";
}

// Removes the skill only if OpenBuddy wrote it.
export function removeSkill(file = skillFile()): boolean {
  if (!fs.existsSync(file) || !fs.readFileSync(file, "utf8").includes(MARKER)) return false;
  fs.rmSync(file);
  const dir = path.dirname(file);
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  return true;
}
