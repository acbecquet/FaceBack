import { signToken, verifyToken } from "./tokens";

const NOW = 1_000_000;

test("a freshly signed token verifies and returns its payload", async () => {
  const t = await signToken("secret", { emailHash: "abc" }, 300, NOW);
  const payload = await verifyToken("secret", t, NOW + 1000);
  expect(payload).toMatchObject({ emailHash: "abc" });
});

test("an expired token does not verify", async () => {
  const t = await signToken("secret", { a: 1 }, 300, NOW);
  expect(await verifyToken("secret", t, NOW + 301_000)).toBeNull();
});

test("a token signed with a different secret does not verify", async () => {
  const t = await signToken("secret", { a: 1 }, 300, NOW);
  expect(await verifyToken("other-secret", t, NOW + 1000)).toBeNull();
});

test("a tampered token does not verify", async () => {
  const t = await signToken("secret", { a: 1 }, 300, NOW);
  const tampered = t.slice(0, -2) + (t.endsWith("A") ? "B" : "A");
  expect(await verifyToken("secret", tampered, NOW + 1000)).toBeNull();
});
