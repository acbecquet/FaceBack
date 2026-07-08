import { config } from "./config";

test("config has sane image, rate-limit, and API base defaults", () => {
  expect(config.MAX_IMAGE_EDGE).toBeGreaterThan(0);
  expect(config.MIN_GENERATION_INTERVAL_MS).toBeGreaterThan(0);
  expect(typeof config.FUNCTIONS_BASE_URL).toBe("string");
});
