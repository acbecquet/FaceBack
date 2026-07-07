import { config } from "./config";

export class RecoveryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RecoveryError";
    this.code = code;
  }
}

async function post(path: string, body: unknown, fetchImpl: typeof fetch): Promise<any> {
  const res = await fetchImpl(`${config.FUNCTIONS_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new RecoveryError(data?.error?.code ?? "request_failed", data?.error?.message ?? "Failed");
  }
  return data;
}

export async function requestRecoveryCode(
  email: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ token: string }> {
  return post("/recovery/request", { email }, fetchImpl);
}

export async function verifyRecoveryCode(
  token: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ resetToken: string }> {
  return post("/recovery/verify", { token, code }, fetchImpl);
}
