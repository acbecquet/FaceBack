export function validateSignup(input: unknown): { username: string; email: string } | { error: string } {
  const o = (input ?? {}) as Record<string, unknown>;
  const username = typeof o.username === "string" ? o.username.trim().toLowerCase() : "";
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
  if (!username || username.includes("@")) return { error: "Username is required and cannot contain @." };
  if (!email || !email.includes("@")) return { error: "A valid email is required." };
  return { username, email };
}

export function validateIdentifier(input: unknown): string | null {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.identifier !== "string") return null;
  const id = o.identifier.trim().toLowerCase();
  return id === "" ? null : id;
}
