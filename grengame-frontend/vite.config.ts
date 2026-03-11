/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";

// Usa Vite para build/dev; Vitest lê o bloco test quando presente.
export default defineConfig({
  base: process.env.VITE_BASE_URL || "/",
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // @ts-expect-error: propriedade reconhecida pelo Vitest, não pelo tipo base do Vite.
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
