import { afterEach, expect, test, vi } from "vitest";
import { createRecordingProvider, createResendProvider } from "./email";

afterEach(() => vi.restoreAllMocks());

test("recording provider captures sent codes", async () => {
  const p = createRecordingProvider();
  await p.sendCode({ to: "a@example.com", code: "123456", purpose: "auth" });
  expect(p.sent).toEqual([{ to: "a@example.com", code: "123456", purpose: "auth" }]);
});

test("resend provider posts to the Resend API with auth + recipient", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "e1" }), { status: 200 }),
  );
  const p = createResendProvider("re_test_key", "faceback@acb-apps.com");
  await p.sendCode({ to: "b@example.com", code: "654321", purpose: "auth" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect((init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer re_test_key");
  const body = JSON.parse(init!.body as string);
  expect(body.from).toBe("faceback@acb-apps.com");
  expect(body.to).toBe("b@example.com");
  expect(body.text).toContain("654321");
});

test("resend provider throws on non-ok response", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 422 }));
  const p = createResendProvider("k", "f@acb-apps.com");
  await expect(p.sendCode({ to: "c@example.com", code: "000000", purpose: "auth" })).rejects.toThrow();
});
