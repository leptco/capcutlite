import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ffmpeg.wasm cần các header COOP/COEP để dùng SharedArrayBuffer khi chạy multi-thread.
// Cấu hình dưới đây bật sẵn cho server dev.
export default defineConfig({
  plugins: [react()],
  esolve: {
    alias: {
      "onnxruntime-node": "onnxruntime-web",
    },
  },

  optimizeDeps: {
    exclude: ["onnxruntime-node"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
