import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { addToAllowlist, removeFromAllowlist, isAllowlisted, listAllowlist } from "./allowlist";

test("add, check, list, remove - case-insensitive", async () => {
  await addToAllowlist(env, "Friend@Example.com");
  expect(await isAllowlisted(env, "friend@example.com")).toBe(true);
  expect(await listAllowlist(env)).toContain("friend@example.com");
  await removeFromAllowlist(env, "friend@example.com");
  expect(await isAllowlisted(env, "friend@example.com")).toBe(false);
});
