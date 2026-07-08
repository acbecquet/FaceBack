import type { Env } from "../../env";
import type { Account } from "../../data/accounts";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import {
  listAllowlist,
  addToAllowlist,
  removeFromAllowlist,
} from "../../data/allowlist";

async function requireDevOwner(
  req: Request,
  env: Env
): Promise<Account | Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  if (!account.isDev) return errorResponse("forbidden", "Not allowed.", 403);
  return account;
}

export async function handleListAllowlist(
  req: Request,
  env: Env
): Promise<Response> {
  const gate = await requireDevOwner(req, env);
  if (gate instanceof Response) return gate;
  return json({ emails: await listAllowlist(env) });
}

function parseEmail(body: unknown): string | null {
  const o = (body ?? {}) as Record<string, unknown>;
  if (typeof o.email !== "string") return null;
  const email = o.email.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export async function handleAddAllowlist(
  req: Request,
  env: Env
): Promise<Response> {
  const gate = await requireDevOwner(req, env);
  if (gate instanceof Response) return gate;
  const email = parseEmail(await req.json().catch(() => null));
  if (!email) return errorResponse("bad_input", "A valid email is required.", 400);
  await addToAllowlist(env, email);
  return json({ ok: true });
}

export async function handleRemoveAllowlist(
  req: Request,
  env: Env
): Promise<Response> {
  const gate = await requireDevOwner(req, env);
  if (gate instanceof Response) return gate;
  const email = parseEmail(await req.json().catch(() => null));
  if (!email) return errorResponse("bad_input", "A valid email is required.", 400);
  await removeFromAllowlist(env, email);
  return json({ ok: true });
}
