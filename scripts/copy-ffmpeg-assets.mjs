// Sao chép asset ffmpeg.wasm từ node_modules vào public/ffmpeg để ứng dụng chạy
// hoàn toàn cục bộ (cùng origin), KHÔNG phụ thuộc CDN tại thời điểm runtime.
//
// Chạy tự động sau mỗi `npm install` (postinstall), hoặc chạy tay:
//   node scripts/copy-ffmpeg-assets.mjs
//
// Quan trọng: @ffmpeg/ffmpeg mở worker từ classWorkerURL bên dưới; worker đó import
// tương đối const.js + errors.js nên phải sao chép cả 3 file vào cùng thư mục.
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public", "ffmpeg");

function readVersion(pkgName) {
  try {
    const { version } = JSON.parse(
      readFileSync(join(root, "node_modules", pkgName, "package.json"), "utf8")
    );
    return version;
  } catch {
    return "?";
  }
}

const CORE_PKG = "@ffmpeg/core"; // core (single-thread) — chạy trong worker
const FFMPEG_PKG = "@ffmpeg/ffmpeg"; // thư viện điều khiển + worker bootstrap

const copies = [
  // core: JS glue (ESM) + WASM 32MB
  [join(root, "node_modules", CORE_PKG, "dist", "esm", "ffmpeg-core.js"), join(publicDir, "core", "ffmpeg-core.js")],
  [join(root, "node_modules", CORE_PKG, "dist", "esm", "ffmpeg-core.wasm"), join(publicDir, "core", "ffmpeg-core.wasm")],
  // worker của @ffmpeg/ffmpeg + 2 module nó import tương đối
  [join(root, "node_modules", FFMPEG_PKG, "dist", "esm", "worker.js"), join(publicDir, "ffmpeg", "worker.js")],
  [join(root, "node_modules", FFMPEG_PKG, "dist", "esm", "const.js"), join(publicDir, "ffmpeg", "const.js")],
  [join(root, "node_modules", FFMPEG_PKG, "dist", "esm", "errors.js"), join(publicDir, "ffmpeg", "errors.js")],
];

let failed = false;
for (const [src, dest] of copies) {
  if (!existsSync(src)) {
    console.error(`[copy-ffmpeg-assets] THIẾU nguồn: ${src}`);
    failed = true;
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  const kb = (readFileSync(dest).length / 1024).toFixed(0);
  console.log(`[copy-ffmpeg-assets] ${dest} (${kb} KiB)`);
}

console.log(
  `[copy-ffmpeg-assets] @ffmpeg/core v${readVersion(CORE_PKG)}, @ffmpeg/ffmpeg v${readVersion(FFMPEG_PKG)}`
);
if (failed) {
  console.error("[copy-ffmpeg-assets] Có file thiếu — chạy `npm i @ffmpeg/core@0.12.6` trước.");
  process.exit(1);
}