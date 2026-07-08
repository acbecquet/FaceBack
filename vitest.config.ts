import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The installed @cloudflare/vitest-pool-workers (v0.18, built for Vitest 4)
// configures the Workers runtime via a Vite plugin rather than the older
// `defineWorkersConfig` wrapper the brief sketched; this follows the current
// documented pattern (see the `d1` fixture under
// cloudflare/workers-sdk/fixtures/vitest-pool-workers-examples).
export default defineConfig(async () => {
  // Read migrations/*.sql once here (in Node, at config time) and hand them
  // to the worker as a plain test-only binding; `test/apply-migrations.ts`
  // applies them from inside the Workers runtime before tests run.
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Bindings the tests need; secrets are injected as plain strings here.
          bindings: {
            KEY_ENC_SECRET: "test-key-enc-secret-value",
            SESSION_SECRET: "test-session-secret-value",
            RESEND_API_KEY: "test-resend-key",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      // Matches the Phase 1 packages (`functions/`, `web/`): tests use the
      // bare `test`/`expect` globals rather than importing them everywhere.
      globals: true,
      setupFiles: ["./test/apply-migrations.ts"],
      // Scope this project to `shared/` only. `functions/` and `web/` are
      // separate npm packages with their own vitest.config.ts (node and
      // jsdom environments respectively); without this, a bare `vitest run`
      // from the repo root would also pick up their *.test.ts files and run
      // them through the Workers pool, where DOM globals like `indexedDB`
      // and `localStorage` do not exist.
      include: ["shared/**/*.test.ts"],
    },
  };
});
