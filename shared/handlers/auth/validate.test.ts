import { expect, test } from "vitest";
import { validateSignup, validateIdentifier } from "./validate";

test("valid signup normalizes and passes", () => {
  expect(validateSignup({ username: " Alice ", email: "Alice@Example.com" }))
    .toEqual({ username: "alice", email: "alice@example.com" });
});
test("username with @ or empty is rejected", () => {
  expect("error" in validateSignup({ username: "a@b", email: "x@y.com" })).toBe(true);
  expect("error" in validateSignup({ username: "", email: "x@y.com" })).toBe(true);
});
test("bad email is rejected", () => {
  expect("error" in validateSignup({ username: "ok", email: "no-at-sign" })).toBe(true);
});
test("validateIdentifier trims/lowercases or returns null", () => {
  expect(validateIdentifier({ identifier: " Bob " })).toBe("bob");
  expect(validateIdentifier({ identifier: "" })).toBeNull();
  expect(validateIdentifier({ identifier: 5 })).toBeNull();
});
