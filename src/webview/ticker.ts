// Runs webview feature steps on a fixed interval, isolating each so one failure can't stop the rest.

export type Step = [name: string, run: () => unknown];

const DEFAULT_INTERVAL_MS = 2000;

// Runs every step now and then on each interval, warning once per failing step.
export function startTicker(steps: Step[], label: string, intervalMs = DEFAULT_INTERVAL_MS): void {
  const failed = new Set<string>();
  const tick = () => steps.forEach(([name, run]) => {
    try { run(); } catch (e) {
      if (!failed.has(name)) { failed.add(name); console.warn(`[${label}] ${name} failed`, e); }
    }
  });
  tick();
  setInterval(tick, intervalMs);
}
