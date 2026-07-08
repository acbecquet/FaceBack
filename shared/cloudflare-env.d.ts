// Ambient augmentation so `import { env } from "cloudflare:workers"` (the
// non-deprecated way to read bindings, both at runtime and in tests) is typed
// as our real `Env` shape. `@cloudflare/workers-types` declares `Cloudflare.Env`
// as an intentionally empty interface meant to be extended by the project
// (see its doc comment: "the specific project can extend Env by redeclaring
// it in project-specific files"), and `@cloudflare/vitest-pool-workers`
// deprecates `cloudflare:test`'s own `env` export in favor of this one.
//
// Kept as a separate file (rather than inside `shared/env.ts` itself) since
// that file's content is specified verbatim elsewhere.
import type { Env as AppEnv } from "./env";

declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {}
  }
}
