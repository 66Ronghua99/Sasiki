import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(rootDir, "shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(rootDir, "shared"),
      },
    },
  },
  renderer: {
    root: "renderer",
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(rootDir, "renderer/src"),
        "@shared": resolve(rootDir, "shared"),
      },
    },
  },
});
