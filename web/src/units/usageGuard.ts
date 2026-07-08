import { config } from "./config";

const KEY = "faceback.usage";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UsageDecision {
  allowed: boolean;
  reason?: "too_soon";
}

// Pure decision over a timestamp history. `now` is passed in for determinism.
// The daily cap is enforced server-side; this only keeps the min-interval courtesy throttle.
export function decide(now: number, history: number[]): UsageDecision {
  const last = history.length ? Math.max(...history) : -Infinity;
  if (now - last < config.MIN_GENERATION_INTERVAL_MS) return { allowed: false, reason: "too_soon" };
  return { allowed: true };
}

// Append `now` and prune entries older than 24h.
export function record(now: number, history: number[]): number[] {
  return [...history.filter((t) => now - t < DAY_MS), now];
}

export function loadHistory(): number[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: number[]): void {
  localStorage.setItem(KEY, JSON.stringify(history));
}
