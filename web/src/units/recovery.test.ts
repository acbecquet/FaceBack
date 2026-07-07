import { requestRecoveryCode, verifyRecoveryCode, RecoveryError } from "./recovery";
import { test, expect } from "vitest";

function fetchReturning(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

test("requestRecoveryCode returns the token from the function", async () => {
  const out = await requestRecoveryCode("u@e.com", fetchReturning({ token: "T" }));
  expect(out).toEqual({ token: "T" });
});

test("verifyRecoveryCode returns the reset token", async () => {
  const out = await verifyRecoveryCode("T", "CODE", fetchReturning({ resetToken: "R" }));
  expect(out).toEqual({ resetToken: "R" });
});

test("a failed verify throws RecoveryError with the server code", async () => {
  try {
    await verifyRecoveryCode("T", "bad", fetchReturning({ error: { code: "invalid_code", message: "x" } }, 401));
    throw new Error("Expected RecoveryError to be thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(RecoveryError);
    expect(e).toMatchObject({ code: "invalid_code" });
  }
});
