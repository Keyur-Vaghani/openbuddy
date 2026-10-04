// Builds the host bundle (dist/extension.js) and the webview script appended to Claude Code (dist/injected.js).

import { build, context } from "esbuild";
import { readFileSync } from "node:fs";

const previewCss = readFileSync(new URL("./assets/preview.css", import.meta.url), "utf8");

const host = {
  entryPoints: ["src/extension.ts", "src/uninstall.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  logLevel: "info",
};

const injected = {
  entryPoints: ["src/webview/main.ts"],
  outfile: "dist/injected.js",
  bundle: true,
  minify: true,
  define: { __OPENBUDDY_PREVIEW_CSS__: JSON.stringify(previewCss) },
  platform: "browser",
  format: "iife",
  target: "es2020",
  logLevel: "info",
};

const configs = [host, injected];

if (process.argv.includes("--watch")) {
  const ctxs = await Promise.all(configs.map((c) => context(c)));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("watching…");
} else {
  await Promise.all(configs.map((c) => build(c)));
  console.log("build complete");
}
