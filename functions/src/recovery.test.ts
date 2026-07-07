import { handleRecovery } from "./recovery";
import { createRecordingEmailProvider } from "./lib/email";

const NOW = 5_000_000;

function post(path: string, body: unknown): Request {
  return new Request(`http://x${path}`, { method: "POST", body: JSON.stringify(body) });
}

test("request emails a fixed code and returns a token; verify with that code returns a reset token", async () => {
  const email = createRecordingEmailProvider();
  const deps = { secret: "s", email, nowMs: NOW, makeCode: () => "CODE1234" };

  const reqRes = await handleRecovery(post("/recovery/request", { email: "u@e.com" }), deps);
  expect(reqRes.status).toBe(200);
  const { token } = await reqRes.json();
  expect(email.sent).toHaveLength(1);
  expect(email.sent[0].to).toBe("u@e.com");
  expect(email.sent[0].body).toContain("CODE1234");

  const verRes = await handleRecovery(post("/recovery/verify", { token, code: "CODE1234" }), deps);
  expect(verRes.status).toBe(200);
  expect((await verRes.json()).resetToken).toBeTruthy();
});

test("verify with the wrong code returns 401", async () => {
  const email = createRecordingEmailProvider();
  const deps = { secret: "s", email, nowMs: NOW, makeCode: () => "RIGHTONE" };
  const { token } = await (
    await handleRecovery(post("/recovery/request", { email: "u@e.com" }), deps)
  ).json();
  const res = await handleRecovery(post("/recovery/verify", { token, code: "WRONG000" }), deps);
  expect(res.status).toBe(401);
});

test("an unknown path returns 404", async () => {
  const email = createRecordingEmailProvider();
  const res = await handleRecovery(post("/recovery/other", {}), { secret: "s", email, nowMs: NOW });
  expect(res.status).toBe(404);
});
