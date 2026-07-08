export const config = {
  MAX_IMAGE_EDGE: 1024, // downscale longest edge before upload
  MIN_GENERATION_INTERVAL_MS: 3_000,
  DAILY_CAP: 50,
  // Base URL for the two stateless functions; overridden per environment in Plan 2.
  FUNCTIONS_BASE_URL: import.meta.env?.VITE_FUNCTIONS_BASE_URL ?? "/api",
} as const;
