import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Applies migrations/*.sql to the local D1 before the suite runs. Setup files
// run outside the per-test-file storage isolation the pool gives regular
// test files, and may run more than once; `applyD1Migrations()` only applies
// migrations that have not already been applied, so a top-level call here is
// safe (this mirrors the current @cloudflare/vitest-pool-workers `d1`
// example, not the older `beforeAll`-in-cloudflare:test sketch, whose `env`
// export is deprecated in the installed version in favor of
// `cloudflare:workers`).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
