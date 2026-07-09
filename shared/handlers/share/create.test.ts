import { describe, it, expect, beforeAll } from "vitest";
import { env as envDefault } from "cloudflare:workers";
import type { Env } from "../../env";
import { handleCreateShareLink } from "./create";
import { handleRedeemShareLink } from "./redeem";
import { createAccount } from "../../data/accounts";
import { signSession, verifySession, SESSION_COOKIE_NAME } from "../../auth/session";

function createReq(auth?: string): Request {
  return new Request("http://localhost/api/share", {
    method: "POST",
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
}

describe("share link create + redeem", () => {
  let env: Env;
  let devId: string;
  let devToken: string;
  let nonDevToken: string;

  beforeAll(async () => {
    env = envDefault as unknown as Env;
    const dev = await createAccount(env, {
      username: "shareowner",
      email: "shareowner@example.com",
      isDev: true,
    });
    devId = dev.id;
    devToken = await signSession(dev.id, env.SESSION_SECRET, Date.now());
    const reg = await createAccount(env, {
      username: "sharereg",
      email: "sharereg@example.com",
      isDev: false,
    });
    nonDevToken = await signSession(reg.id, env.SESSION_SECRET, Date.now());
  });

  it("dev owner creates a link that redeems into their account with a bounded session", async () => {
    const res = await handleCreateShareLink(createReq(devToken), env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { url: string; expiresInSeconds: number };
    expect(data.expiresInSeconds).toBe(3600);
    expect(data.url).toContain("/r?t=");

    const token = decodeURIComponent(new URL(data.url).searchParams.get("t")!);

    const redeem = await handleRedeemShareLink(token, env);
    expect(redeem.status).toBe(302);
    expect(redeem.headers.get("Location")).toBe("/");

    const setCookie = redeem.headers.get("Set-Cookie")!;
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);

    // The redeemed session must be short-lived (<= 1 hour), never the 1-year default.
    const maxAge = Number(setCookie.match(/Max-Age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(3600);

    const cookieToken = setCookie.split(";")[0].split("=").slice(1).join("=");
    // Resolves to the dev account now...
    await expect(verifySession(cookieToken, env.SESSION_SECRET, Date.now())).resolves.toBe(devId);
    // ...and is gone just over an hour later.
    await expect(
      verifySession(cookieToken, env.SESSION_SECRET, Date.now() + 3601 * 1000),
    ).resolves.toBeNull();
  });

  it("a non-dev account cannot create a share link (403)", async () => {
    const res = await handleCreateShareLink(createReq(nonDevToken), env);
    expect(res.status).toBe(403);
  });

  it("an anonymous request cannot create a share link (401)", async () => {
    const res = await handleCreateShareLink(createReq(), env);
    expect(res.status).toBe(401);
  });

  it("an invalid token redeems to no session (redirect, no cookie)", async () => {
    const res = await handleRedeemShareLink("not-a-real-token", env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });
});
