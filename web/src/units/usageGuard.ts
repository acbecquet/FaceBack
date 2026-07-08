import { config } from "./config";

const KEY = "faceback.usage";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UsageDecision {
  allowed: boolean;
  reason?: "too_soon" | "daily_cap";
}

// Pure decision over a timestamp history. `now` is passed in for determinism.
export function decide(now: number, history: number[]): UsageDecision {
  const recent = history.filter((t) => now - t < DAY_MS);
  const last = history.length ? Math.max(...history) : -Infinity;
  if (now - last < config.MIN_GENERATION_INTERVAL_MS) return { allowed: false, reason: "too_soon" };
  if (recent.length >= config.DAILY_CAP) return { allowed: false, reason: "daily_cap" };
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
