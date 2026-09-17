import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Vite builds the React renderer only. The Electron main/preload processes
// are compiled separately by `tsc -p electron.tsconfig.json` (see package.json).
//
// IMPORTANT: `root` is set to the renderer source dir so index.html is the
// entry, but `outDir` is an ABSOLUTE path at the project root so the built
// assets always land in <project>/dist-renderer (not nested under root).
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  // Disable PostCSS config lookup — we don't use Tailwind/PostCSS plugins in
  // the renderer, and Vite would otherwise inherit a parent project's config.
  css: {
    postcss: {
      plugins: [],
    },
  },
  build: {
    outDir: resolve(__dirname, "dist-renderer"),
    emptyOutDir: true,
    target: "chrome120",
    rollupOptions: {
      input: resolve(__dirname, "src/renderer/index.html"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
