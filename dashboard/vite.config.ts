import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: import.meta.dirname + "/src",
  plugins: [react()],
  base: "/dashboard/",
  server: {
    port: 5173,
    proxy: {
      "/api/dashboard": "http://localhost:8787",
    },
  },
  build: {
    outDir: "../dist/dashboard",
    emptyOutDir: true,
  },
});
