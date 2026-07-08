import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { functionsDev } from "./vite-functions-plugin";

export default defineConfig({
  plugins: [react(), functionsDev()],
  server: { host: true },
});
