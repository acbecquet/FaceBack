import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local `/api` mocking (previously a Vite dev-middleware plugin here) returns
// via `wrangler pages dev` against the real Pages Functions backend; see
// docs/superpowers/plans/2026-07-08-faceback-hosted-01-foundation.md.
export default defineConfig({
  plugins: [react()],
  server: { host: true },
});
