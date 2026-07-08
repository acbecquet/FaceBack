// Test-only augmentation of the global `Cloudflare.Env` (the same interface
// `shared/cloudflare-env.d.ts` extends with the real `Env` from `shared/env.ts`)
// so `test/apply-migrations.ts` can read the `TEST_MIGRATIONS` binding that
// `vitest.config.ts` injects as a miniflare binding for the test run only.
// It is not part of the production `Env` (that lives solely in
// `shared/env.ts`): kept here, under `test/`, so it is only visible to the
// root tsconfig's `shared/` + `test/` compilation, not to `functions/`'s
// production build (whose tsconfig does not include `../test`).
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
