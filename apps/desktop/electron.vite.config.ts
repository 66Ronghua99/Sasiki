import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(rootDir, "main/index.ts"),
      },
    },
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(rootDir, "shared"),
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: resolve(rootDir, "preload/index.ts"),
      },
    },
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(rootDir, "shared"),
      },
    },
  },
  renderer: {
    root: resolve(rootDir, "renderer"),
    build: {
      rollupOptions: {
        input: resolve(rootDir, "renderer/index.html"),
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(rootDir, "renderer/src"),
        "@shared": resolve(rootDir, "shared"),
      },
    },
  },
});
