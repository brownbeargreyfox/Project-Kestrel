// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tsconfigPaths()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@core": path.resolve(__dirname, "src/core"),
        "@components": path.resolve(__dirname, "src/components"),
        "@plugins": path.resolve(__dirname, "src/plugins"),
        "@types": path.resolve(__dirname, "src/types"),
        "@store": path.resolve(__dirname, "src/store"),
        "@utils": path.resolve(__dirname, "src/utils"),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Your Express API
        "/api": { target: "http://localhost:3001", changeOrigin: true },
        // Your plugin origin you mentioned on :5174
        "/plugins": { target: "http://localhost:5174", changeOrigin: true },
      },
    },
    // Optional: tighten deps if you like
    optimizeDeps: {
      entries: ["src/main.jsx"],
    },
    // Optional: cleaner build
    build: {
      sourcemap: true,
      outDir: "dist",
    },
    define: {
      __APP_ENV__: JSON.stringify(env.APP_ENV || mode),
    },
  };
});
