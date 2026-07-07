import { config } from "./config";

test("config has safe crypto and cost defaults", () => {
  expect(config.PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
  expect(config.MAX_IMAGE_EDGE).toBeGreaterThan(0);
  expect(config.MIN_GENERATION_INTERVAL_MS).toBeGreaterThan(0);
  expect(config.DAILY_CAP).toBeGreaterThan(0);
  expect(typeof config.FUNCTIONS_BASE_URL).toBe("string");
});
