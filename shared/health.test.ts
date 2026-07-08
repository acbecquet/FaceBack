import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleHealth } from "./handlers/health";

test("health handler reports ok and can read D1", async () => {
  const res = await handleHealth(new Request("http://x/api/health"), env);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ ok: true, tables: ["accounts", "dev_allowlist"] });
});
