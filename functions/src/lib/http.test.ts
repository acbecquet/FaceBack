import { json, errorResponse } from "./http";

test("json returns a 200 application/json Response by default", async () => {
  const res = json({ ok: true });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(await res.json()).toEqual({ ok: true });
});

test("errorResponse wraps a typed error body with the given status", async () => {
  const res = errorResponse("bad_input", "missing image", 400);
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: { code: "bad_input", message: "missing image" } });
});
