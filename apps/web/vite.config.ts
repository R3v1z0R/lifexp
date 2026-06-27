import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "LifeXP — level up your real life",
        short_name: "LifeXP",
        description:
          "Log real-world activities, earn XP, level up your hero, and compete with friends.",
        theme_color: "#0E1020",
        background_color: "#0E1020",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["health", "lifestyle", "productivity"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the built app shell so it boots offline.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        // Don't serve the SPA shell for API calls when offline.
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/billing/],
        runtimeCaching: [
          {
            // Google Fonts stylesheets — refresh in background.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            // Google Fonts webfont files — cache hard, they're immutable.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Let us exercise the service worker during `pnpm dev`.
        enabled: true,
        type: "module",
      },
    }),
  ],
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
