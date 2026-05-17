import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: '/gang/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    headers: {
      'Content-Security-Policy': `
        default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;
        worker-src * blob: data: 'self';
        child-src * blob: data: 'self';
        script-src * 'unsafe-inline' 'unsafe-eval' blob: data:;
        connect-src *;
        frame-src *;
        img-src * data: blob:;
        media-src * data: blob:;
      `.replace(/\s+/g, ' ').trim()
    }
  }
})
