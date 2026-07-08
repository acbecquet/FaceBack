import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleGenerate } from "./generate";
import { createAccount, setAccountKey, DEV_ACCOUNT_ID } from "../data/accounts";
import { addToAllowlist } from "../data/allowlist";
import { getUsage } from "../data/usage";
import { signSession } from "../auth/session";
import { encryptApiKey } from "../crypto/keyCipher";
import { GeminiError, type GeminiClient } from "../gemini";

const IMG = { base64: "AAAABBBBCCCC", mimeType: "image/jpeg" };
const GOOD = "x".repeat(200);

function okClient(): GeminiClient {
  return { async generateImage() { return { imageBase64: GOOD, mimeType: "image/jpeg" }; } };
}
function makeOk(): { makeClient: (apiKey: string) => GeminiClient } {
  return { makeClient: () => okClient() };
}

async function giveKey(id: string, key: string) {
  const { ciphertext, iv } = await encryptApiKey(key, env.KEY_ENC_SECRET);
  await setAccountKey(env, id, ciphertext, iv);
}

function req(token: string, body: unknown = { image: IMG }): Request {
  return new Request("http://x/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

test("a normal user with their own key generates using it", async () => {
  const acc = await createAccount(env, { username: "gen1", email: "gen1@example.com" });
  await giveKey(acc.id, "user-key");
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());

  const res = await handleGenerate(req(token), env, makeOk());

  expect(res.status).toBe(200);
  const body = (await res.json()) as { image: { base64: string } };
  expect(body.image.base64).toBe(GOOD);
});

test("a user with no key (not dev, not allowlisted) gets 400 no_key", async () => {
  const acc = await createAccount(env, { username: "gen2", email: "gen2@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());

  const res = await handleGenerate(req(token), env, makeOk());

  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { code: string } };
  expect(body.error.code).toBe("no_key");
});

test("an allow-listed friend uses the dev key and increments usage", async () => {
  await giveKey(DEV_ACCOUNT_ID, "dev-key"); // dev account seeded by migration
  const friend = await createAccount(env, { username: "friend", email: "friend@example.com" });
  await addToAllowlist(env, "friend@example.com");
  const token = await signSession(friend.id, env.SESSION_SECRET, Date.now());
  let usedKey = "";
  const spyMake = { makeClient: (k: string) => { usedKey = k; return okClient(); } };

  const res = await handleGenerate(req(token), env, spyMake);

  expect(res.status).toBe(200);
  expect(usedKey).toBe("dev-key");
  expect((await getUsage(env, "friend@example.com", Date.now())).friend).toBe(1);
});

test("anonymous request is 401; a Gemini 429 maps to 429", async () => {
  const anon = new Request("http://x/api/generate", { method: "POST", body: JSON.stringify({ image: IMG }) });
  expect((await handleGenerate(anon, env, makeOk())).status).toBe(401);

  const acc = await createAccount(env, { username: "gen3", email: "gen3@example.com" });
  await giveKey(acc.id, "k");
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const throw429 = {
    makeClient: (): GeminiClient => ({
      async generateImage() { throw new GeminiError("rate", 429); },
    }),
  };

  expect((await handleGenerate(req(token), env, throw429)).status).toBe(429);
});
