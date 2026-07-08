import { config } from "./config";

export interface PublicAccount {
  username: string;
  email: string;
  hasOwnKey: boolean;
  isDev: boolean;
  usesDevKey: boolean;
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function call<T>(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(`${config.FUNCTIONS_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      data?.error?.code ?? "request_failed",
      data?.error?.message ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

export const meApi = {
  async get(fetchImpl?: typeof fetch): Promise<PublicAccount | null> {
    try {
      return await call<PublicAccount>("/me", { method: "GET" }, fetchImpl);
    } catch (e) {
      if (e instanceof ApiError) return null;
      throw e;
    }
  },
};

export const authApi = {
  signup(
    input: { username: string; email: string },
    fetchImpl?: typeof fetch,
  ): Promise<{ pending: boolean }> {
    return call(
      "/auth/signup",
      { method: "POST", body: JSON.stringify(input) },
      fetchImpl,
    );
  },

  request(
    input: { identifier: string },
    fetchImpl?: typeof fetch,
  ): Promise<{ pending: boolean }> {
    return call(
      "/auth/request",
      { method: "POST", body: JSON.stringify(input) },
      fetchImpl,
    );
  },

  verify(
    input: { identifier: string; code: string },
    fetchImpl?: typeof fetch,
  ): Promise<{ account: PublicAccount }> {
    return call(
      "/auth/verify",
      { method: "POST", body: JSON.stringify(input) },
      fetchImpl,
    );
  },

  logout(fetchImpl?: typeof fetch): Promise<{ ok: boolean }> {
    return call("/auth/logout", { method: "POST" }, fetchImpl);
  },
};

export const keyApi = {
  setInitial(
    input: { apiKey: string },
    fetchImpl?: typeof fetch,
  ): Promise<{ ok: boolean }> {
    return call(
      "/key",
      { method: "POST", body: JSON.stringify(input) },
      fetchImpl,
    );
  },

  challenge(fetchImpl?: typeof fetch): Promise<{ pending: boolean }> {
    return call("/key/challenge", { method: "POST" }, fetchImpl);
  },

  reveal(
    input: { code: string },
    fetchImpl?: typeof fetch,
  ): Promise<{ apiKey: string | null; editToken: string }> {
    return call(
      "/key/reveal",
      { method: "POST", body: JSON.stringify(input) },
      fetchImpl,
    );
  },

  edit(
    input: { apiKey: string; editToken: string },
    fetchImpl?: typeof fetch,
  ): Promise<{ ok: boolean }> {
    return call(
      "/key",
      { method: "PUT", body: JSON.stringify(input) },
      fetchImpl,
    );
  },
};

export const allowlistApi = {
  list(fetchImpl?: typeof fetch): Promise<{ emails: string[] }> {
    return call("/dev/allowlist", { method: "GET" }, fetchImpl);
  },

  add(email: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean }> {
    return call(
      "/dev/allowlist",
      { method: "POST", body: JSON.stringify({ email }) },
      fetchImpl,
    );
  },

  remove(email: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean }> {
    return call(
      "/dev/allowlist",
      { method: "DELETE", body: JSON.stringify({ email }) },
      fetchImpl,
    );
  },
};
