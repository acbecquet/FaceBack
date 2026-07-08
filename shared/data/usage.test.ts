import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { getUsage, incrementUsage, overCap, FRIEND_CAP, GLOBAL_CAP } from "./usage";

const NOW = 1_800_000_000_000;

test("increment tracks per-friend and global counts for the day", async () => {
  await incrementUsage(env, "f@example.com", NOW);
  await incrementUsage(env, "f@example.com", NOW);
  const u = await getUsage(env, "f@example.com", NOW);
  expect(u.friend).toBe(2);
  expect(u.global).toBe(2);
});

test("overCap trips at the friend cap for a friend, exempt for the owner", () => {
  expect(overCap({ friend: FRIEND_CAP, global: 5 }, false)).toBe(true);
  expect(overCap({ friend: FRIEND_CAP, global: 5 }, true)).toBe(false);
  expect(overCap({ friend: 0, global: GLOBAL_CAP }, true)).toBe(true);
});
