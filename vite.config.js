import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ffmpeg.wasm cần các header COOP/COEP để dùng SharedArrayBuffer khi chạy multi-thread.
// Bật cho cả server dev lẫn vite preview (bản build nếu deploy lên host khác phải tự bật).
export default defineConfig({
  plugins: [react()],
  resolve: {
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
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
