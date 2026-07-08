import { beforeEach, expect, test } from "vitest";
import { decide, record, loadHistory, saveHistory } from "./usageGuard";
import { config } from "./config";

beforeEach(() => localStorage.clear());

const NOW = 1_000_000_000_000;

test("decide allows generation on an empty history", () => {
  expect(decide(NOW, [])).toEqual({ allowed: true });
});

test("decide blocks as too_soon within the minimum interval", () => {
  const last = NOW - (config.MIN_GENERATION_INTERVAL_MS - 1);
  expect(decide(NOW, [last])).toEqual({ allowed: false, reason: "too_soon" });
});

test("record appends now and prunes entries older than 24h", () => {
  const old = NOW - 25 * 60 * 60 * 1000;
  const recent = NOW - 60_000;
  expect(record(NOW, [old, recent])).toEqual([recent, NOW]);
});

test("loadHistory and saveHistory round-trip; loadHistory returns [] when empty or corrupt", () => {
  expect(loadHistory()).toEqual([]);
  saveHistory([1, 2, 3]);
  expect(loadHistory()).toEqual([1, 2, 3]);
  localStorage.setItem("faceback.usage", "not json");
  expect(loadHistory()).toEqual([]);
});
