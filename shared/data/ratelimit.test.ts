import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { checkRateLimit } from "./ratelimit";

const NOW = 1_800_000_000_000;

test("allows up to the limit, then blocks, within a window", async () => {
  const results: boolean[] = [];
  for (let i = 0; i < 4; i++) results.push(await checkRateLimit(env, "email", "x@example.com", 3, 3600, NOW));
  expect(results).toEqual([true, true, true, false]);
});

test("resets in the next window", async () => {
  await checkRateLimit(env, "ip", "1.2.3.4", 1, 3600, NOW);
  expect(await checkRateLimit(env, "ip", "1.2.3.4", 1, 3600, NOW)).toBe(false);
  expect(await checkRateLimit(env, "ip", "1.2.3.4", 1, 3600, NOW + 3600 * 1000)).toBe(true);
});
