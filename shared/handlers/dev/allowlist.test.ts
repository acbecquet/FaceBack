import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env as envDefault } from "cloudflare:workers";
import type { Env } from "../../env";
import {
  handleListAllowlist,
  handleAddAllowlist,
  handleRemoveAllowlist,
} from "./allowlist";
import { createAccount } from "../../data/accounts";
import { signSession } from "../../auth/session";

describe("dev allowlist endpoints", () => {
  let env: Env;
  let devOwnerSessionToken: string;
  let nonDevSessionToken: string;

  beforeAll(async () => {
    env = envDefault as unknown as Env;

    // Create dev-owner account and sign session
    const owner = await createAccount(env, {
      username: "owner",
      email: "owner@example.com",
      isDev: true,
    });
    devOwnerSessionToken = await signSession(
      owner.id,
      env.SESSION_SECRET,
      Date.now()
    );

    // Create non-dev account and sign session
    const nonDev = await createAccount(env, {
      username: "regular",
      email: "regular@example.com",
      isDev: false,
    });
    nonDevSessionToken = await signSession(
      nonDev.id,
      env.SESSION_SECRET,
      Date.now()
    );
  });

  afterAll(async () => {
    // Cleanup handled by test teardown
  });

  it("dev owner can add email, list it, and remove it", async () => {
    const testEmail = "test@example.com";

    // List should be empty initially
    const listReq1 = new Request("http://localhost/api/dev/allowlist", {
      method: "GET",
      headers: { Authorization: `Bearer ${devOwnerSessionToken}` },
    });
    const listRes1 = await handleListAllowlist(listReq1, env);
    expect(listRes1.status).toBe(200);
    const listData1 = (await listRes1.json()) as { emails: string[] };
    expect(Array.isArray(listData1.emails)).toBe(true);

    // Add email
    const addReq = new Request("http://localhost/api/dev/allowlist", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${devOwnerSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: testEmail }),
    });
    const addRes = await handleAddAllowlist(addReq, env);
    expect(addRes.status).toBe(200);
    const addData = (await addRes.json()) as { ok: boolean };
    expect(addData.ok).toBe(true);

    // List should contain the email
    const listReq2 = new Request("http://localhost/api/dev/allowlist", {
      method: "GET",
      headers: { Authorization: `Bearer ${devOwnerSessionToken}` },
    });
    const listRes2 = await handleListAllowlist(listReq2, env);
    expect(listRes2.status).toBe(200);
    const listData2 = (await listRes2.json()) as { emails: string[] };
    expect(listData2.emails).toContain(testEmail);

    // Remove email
    const removeReq = new Request("http://localhost/api/dev/allowlist", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${devOwnerSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: testEmail }),
    });
    const removeRes = await handleRemoveAllowlist(removeReq, env);
    expect(removeRes.status).toBe(200);
    const removeData = (await removeRes.json()) as { ok: boolean };
    expect(removeData.ok).toBe(true);

    // List should not contain the email
    const listReq3 = new Request("http://localhost/api/dev/allowlist", {
      method: "GET",
      headers: { Authorization: `Bearer ${devOwnerSessionToken}` },
    });
    const listRes3 = await handleListAllowlist(listReq3, env);
    expect(listRes3.status).toBe(200);
    const listData3 = (await listRes3.json()) as { emails: string[] };
    expect(listData3.emails).not.toContain(testEmail);
  });

  it("non-dev account gets 403 on all endpoints and does not mutate list", async () => {
    const testEmail = "shouldnotadd@example.com";

    // List should return 403
    const listReq = new Request("http://localhost/api/dev/allowlist", {
      method: "GET",
      headers: { Authorization: `Bearer ${nonDevSessionToken}` },
    });
    const listRes = await handleListAllowlist(listReq, env);
    expect(listRes.status).toBe(403);

    // Add should return 403
    const addReq = new Request("http://localhost/api/dev/allowlist", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nonDevSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: testEmail }),
    });
    const addRes = await handleAddAllowlist(addReq, env);
    expect(addRes.status).toBe(403);

    // Verify email was not added - dev owner should not see it
    const verifyReq = new Request("http://localhost/api/dev/allowlist", {
      method: "GET",
      headers: { Authorization: `Bearer ${devOwnerSessionToken}` },
    });
    const verifyRes = await handleListAllowlist(verifyReq, env);
    expect(verifyRes.status).toBe(200);
    const verifyData = (await verifyRes.json()) as { emails: string[] };
    expect(verifyData.emails).not.toContain(testEmail);

    // Remove should return 403
    const removeReq = new Request("http://localhost/api/dev/allowlist", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${nonDevSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: testEmail }),
    });
    const removeRes = await handleRemoveAllowlist(removeReq, env);
    expect(removeRes.status).toBe(403);
  });

  it("anonymous request gets 401", async () => {
    // List should return 401
    const listReq = new Request("http://localhost/api/dev/allowlist", {
      method: "GET",
    });
    const listRes = await handleListAllowlist(listReq, env);
    expect(listRes.status).toBe(401);

    // Add should return 401
    const addReq = new Request("http://localhost/api/dev/allowlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    const addRes = await handleAddAllowlist(addReq, env);
    expect(addRes.status).toBe(401);

    // Remove should return 401
    const removeReq = new Request("http://localhost/api/dev/allowlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    const removeRes = await handleRemoveAllowlist(removeReq, env);
    expect(removeRes.status).toBe(401);
  });
});
