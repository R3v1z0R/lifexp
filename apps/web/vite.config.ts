import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Workspace packages ship TS source only (no dist build), so point Vite
      // straight at the source — it transpiles TS on the fly.
      "@lifexp/types": fileURLToPath(new URL("../../packages/types/src/index.ts", import.meta.url)),
      "@lifexp/xp-engine": fileURLToPath(
        new URL("../../packages/xp-engine/src/index.ts", import.meta.url)
      ),
    },
  },
  server: {
    port: 5173,
  },
});
