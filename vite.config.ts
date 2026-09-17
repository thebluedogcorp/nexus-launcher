import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Vite builds the React renderer only. The Electron main/preload processes
// are compiled separately by `tsc -p electron.tsconfig.json` (see package.json).
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
