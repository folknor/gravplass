import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist/client",
    emptyDirOnBuild: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/d": "http://localhost:3000",
    },
  },
});
