import { meApi, authApi, keyApi, allowlistApi, ApiError, type PublicAccount } from "./apiClient";

function fetchSpy(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const account: PublicAccount = {
  username: "alice",
  email: "alice@example.com",
  hasOwnKey: true,
  isDev: false,
  usesDevKey: false,
};

test("meApi.get returns the parsed account on a 200", async () => {
  const { impl, calls } = fetchSpy(account, 200);

  const out = await meApi.get(impl);

  expect(out).toEqual(account);
  expect(calls[0].url).toContain("/me");
  expect(calls[0].init.method).toBe("GET");
  expect(calls[0].init.credentials).toBe("include");
});

test("meApi.get returns null on a 401", async () => {
  const { impl } = fetchSpy({ error: { code: "unauthorized", message: "Sign in required." } }, 401);

  const out = await meApi.get(impl);

  expect(out).toBeNull();
});

test("authApi.signup posts the username and email, credentials included", async () => {
  const { impl, calls } = fetchSpy({ pending: true });

  const out = await authApi.signup({ username: "bob", email: "bob@example.com" }, impl);

  expect(out).toEqual({ pending: true });
  expect(calls[0].url).toContain("/auth/signup");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.credentials).toBe("include");
  expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ username: "bob", email: "bob@example.com" });
});

test("authApi.request posts the identifier, credentials included", async () => {
  const { impl, calls } = fetchSpy({ pending: true });

  const out = await authApi.request({ identifier: "bob" }, impl);

  expect(out).toEqual({ pending: true });
  expect(calls[0].url).toContain("/auth/request");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.credentials).toBe("include");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ identifier: "bob" });
});

test("authApi.verify posts identifier and code and returns the account, credentials included", async () => {
  const { impl, calls } = fetchSpy({ account });

  const out = await authApi.verify({ identifier: "bob", code: "123456" }, impl);

  expect(out).toEqual({ account });
  expect(calls[0].url).toContain("/auth/verify");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.credentials).toBe("include");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ identifier: "bob", code: "123456" });
});

test("authApi.logout posts with no body, credentials included", async () => {
  const { impl, calls } = fetchSpy({ ok: true });

  const out = await authApi.logout(impl);

  expect(out).toEqual({ ok: true });
  expect(calls[0].url).toContain("/auth/logout");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.credentials).toBe("include");
});

test("keyApi.setInitial posts the apiKey to /key, credentials included", async () => {
  const { impl, calls } = fetchSpy({ ok: true });

  const out = await keyApi.setInitial({ apiKey: "sk-abc" }, impl);

  expect(out).toEqual({ ok: true });
  expect(calls[0].url).toContain("/key");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.credentials).toBe("include");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ apiKey: "sk-abc" });
});

test("keyApi.challenge posts with no body to /key/challenge, credentials included", async () => {
  const { impl, calls } = fetchSpy({ pending: true });

  const out = await keyApi.challenge(impl);

  expect(out).toEqual({ pending: true });
  expect(calls[0].url).toContain("/key/challenge");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.credentials).toBe("include");
});

test("keyApi.reveal posts the code and returns apiKey + editToken, credentials included", async () => {
  const { impl, calls } = fetchSpy({ apiKey: "sk-real", editToken: "tok" });

  const out = await keyApi.reveal({ code: "654321" }, impl);

  expect(out).toEqual({ apiKey: "sk-real", editToken: "tok" });
  expect(calls[0].url).toContain("/key/reveal");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.credentials).toBe("include");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ code: "654321" });
});

test("keyApi.edit PUTs the apiKey and editToken to /key, credentials included", async () => {
  const { impl, calls } = fetchSpy({ ok: true });

  const out = await keyApi.edit({ apiKey: "sk-new", editToken: "tok" }, impl);

  expect(out).toEqual({ ok: true });
  expect(calls[0].url).toContain("/key");
  expect(calls[0].init.method).toBe("PUT");
  expect(calls[0].init.credentials).toBe("include");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ apiKey: "sk-new", editToken: "tok" });
});

test("allowlistApi.list gets /dev/allowlist, credentials included", async () => {
  const { impl, calls } = fetchSpy({ emails: ["friend@example.com"] });

  const out = await allowlistApi.list(impl);

  expect(out).toEqual({ emails: ["friend@example.com"] });
  expect(calls[0].url).toContain("/dev/allowlist");
  expect(calls[0].init.method).toBe("GET");
  expect(calls[0].init.credentials).toBe("include");
});

test("allowlistApi.add posts the email, credentials included", async () => {
  const { impl, calls } = fetchSpy({ ok: true });

  const out = await allowlistApi.add("friend@example.com", impl);

  expect(out).toEqual({ ok: true });
  expect(calls[0].url).toContain("/dev/allowlist");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.credentials).toBe("include");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: "friend@example.com" });
});

test("allowlistApi.remove deletes with the email in the body, credentials included", async () => {
  const { impl, calls } = fetchSpy({ ok: true });

  const out = await allowlistApi.remove("friend@example.com", impl);

  expect(out).toEqual({ ok: true });
  expect(calls[0].url).toContain("/dev/allowlist");
  expect(calls[0].init.method).toBe("DELETE");
  expect(calls[0].init.credentials).toBe("include");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: "friend@example.com" });
});

test("a non-ok response throws ApiError carrying the server code and message", async () => {
  const { impl } = fetchSpy({ error: { code: "rate_limited", message: "Too many attempts." } }, 429);

  const err = await authApi.request({ identifier: "bob" }, impl).catch((e) => e);

  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ code: "rate_limited", message: "Too many attempts." });
});

test("a non-ok response with no parseable body still throws ApiError", async () => {
  const impl = (async () => new Response("not json", { status: 500 })) as unknown as typeof fetch;

  const err = await allowlistApi.list(impl).catch((e) => e);

  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe("request_failed");
});
