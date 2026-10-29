import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.QUIL_API_URL || "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: process.env.QUIL_API_URL || "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
