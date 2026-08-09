import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// Asset ffmpeg được sao chép về public/ffmpeg bởi scripts/copy-ffmpeg-assets.mjs
// (chạy tự động sau `npm install`). Dùng đường dẫn cùng-origin — không phụ thuộc CDN,
// không cần blob URL. Xem hàm createFFmpeg() để biết cách load.
const CORE_BASE = "/ffmpeg/core/";
const FFMPEG_WORKER_URL = "/ffmpeg/ffmpeg/worker.js";
const CORE_JS_URL = `${CORE_BASE}ffmpeg-core.js`;
const CORE_WASM_URL = `${CORE_BASE}ffmpeg-core.wasm`;

// Font cho chữ overlay — bundle cục bộ cùng nguồn gốc (public/fonts/). Hoàn toàn
// KHÔNG phụ thuộc Google Fonts / GitHub raw / CDN nào tại runtime; Vite phục vụ
// static từ public/ trong dev và copy vào dist/fonts/ khi build. Font được tải
// về máy build một lần (không phải tại runtime) và lưu trữ trong repo.
const FONT_URL = "/fonts/NotoSans-Regular.ttf";

/** Giới hạn thời gian cho từng giai đoạn xuất (ms). Mọi bước đều phải có giới hạn
 * để một lần ffmpeg bị treo không "treo" cả giao diện xuất video. */
const TIMEOUT = {
  /** Tải lõi ffmpeg.wasm (JS + wasm) từ CDN. */
  CORE_LOAD: 120_000,
  /** Tải font cho chữ overlay. */
  FONT_LOAD: 30_000,
  /** Ghi file video nguồn vào hệ thống file ảo của ffmpeg. */
  WRITE_FILE: 60_000,
  /** Đọc file kết quả từ hệ thống file ảo. */
  READ_FILE: 30_000,
  /** Render 1 clip: tối thiểu 30s + 5s cho mỗi giây nội dung. */
  clipRender: (durationSec) => 30_000 + Math.round(durationSec) * 5_000,
  /** Ghép lớp + mã hoá: tối thiểu 60s + 8s cho mỗi giây timeline. */
  compose: (durationSec) => 60_000 + Math.round(durationSec) * 8_000,
};

/** Lỗi xuất video, gắn kèm tên giai đoạn để người dùng biết lỗi xảy ra ở bước nào. */
export class ExportError extends Error {
  constructor(message, stage = "") {
    super(message);
    this.name = "ExportError";
    this.stage = stage;
  }
}

let ffmpegInstance = null;
let loadingPromise = null;
let fontLoaded = false;
let fontUsable = false;

// ffmpeg phát sự kiện log/progress không ngừng. Vì chỉ có 1 lần xuất chạy tại 1
// thời điểm (nút "Xuất video" bị khoá khi đang chạy), dùng 1 "ổ cắm" duy nhất để
// route dữ liệu về lần xuất hiện tại.
let logSink = (line) => console.debug("[ffmpeg]", line);
let progressSink = null;

/** Vòng đệm chứa các dòng log ffmpeg gần nhất — sẽ được kèm vào thông báo lỗi. */
const logBuffer = [];
const MAX_LOG_LINES = 80;

function pushLog(message) {
  logBuffer.push(message);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
  if (logSink) logSink(message);
}

/** Chuyển mọi dạng lỗi (Error, chuỗi, Set, mảng) thành chuỗi dễ đọc. */
function describeError(err) {
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const { message } = err;
    if (message instanceof Set) return Array.from(message).join(" ");
    if (Array.isArray(message)) return message.join(" ");
    return message || err.name || String(err);
  }
  return String(err);
}

/** Rút gọn log ffmpeg thành vài dòng hữu ích nhất (ưu tiên dòng báo lỗi). */
function logTail(lines = 8) {
  const all = logBuffer
    .map((line) => String(line?.message ?? line ?? "").trim())
    .filter(Boolean);
  const errorLike = all.filter((line) =>
    /(^|\s)(error|invalid|failed|unable|not found|unsupported|no such|stream specifier|matches no streams)(\s|:|$)/i.test(
      line
    )
  );
  const picked = (errorLike.length > 0 ? errorLike : all).slice(-lines);
  return picked.join("\n");
}

/** Chạy 1 promise kèm giới hạn thời gian — khi hết giờ sẽ báo lỗi rõ ràng. */
function withTimeout(promise, ms, stage) {
  if (!ms || ms <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new ExportError(
            `Bước «${stage}» chạy quá chậm (đã chờ ${Math.round(ms / 1000)}s) — có thể video quá nặng hoặc xử lý bị treo.`,
            stage
          )
        ),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Chạy 1 lệnh ffmpeg (exec) kèm timeout và BẮT BUỘC kiểm tra mã trả về.
 *
 * @ffmpeg/wasm trả về mã lỗi (0 = thành công) thay vì ném exception khi lệnh thất bại.
 * Nếu không tự kiểm tra, lỗi sẽ "im lặng": bước sau chỉ thấy file kết quả không tồn tại
 * và người dùng không biết vì sao. Hàm này quy mọi mã lỗi thành ExportError có kèm log.
 */
async function runFfmpegCommand(ffmpeg, args, { timeoutMs, stageName }) {
  let returnCode;
  try {
    returnCode = await ffmpeg.exec(args, timeoutMs);
  } catch (err) {
    throw new ExportError(`Bước «${stageName}» thất bại: ${describeError(err)}`, stageName);
  }
  if (returnCode !== 0) {
    const tail = logTail();
    const detail = tail ? `\n${tail}` : "";
    const isTimeout = /timeout|timed out|execution timed/i.test(tail);
    if (isTimeout) {
      throw new ExportError(
        `Bước «${stageName}» bị treo quá ${Math.round(timeoutMs / 1000)}s. Video quá nặng hoặc có vấn đề về định dạng.${detail}`,
        stageName
      );
    }
    throw new ExportError(
      `Bước «${stageName}» thất bại (ffmpeg trả về mã ${returnCode}).${detail}`,
      stageName
    );
  }
}

async function createFFmpeg(onStatus) {
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => pushLog(message));
  ffmpeg.on("progress", ({ progress }) => {
    if (progressSink && typeof progress === "number") progressSink(progress);
  });

  console.log("[FFmpeg] Initializing...");
  console.log(`[FFmpeg] coreURL: ${CORE_JS_URL}`);
  console.log(`[FFmpeg] wasmURL: ${CORE_WASM_URL}`);
  console.log(`[FFmpeg] workerURL: ${FFMPEG_WORKER_URL}`);

  try {
    onStatus?.("Đang tải lõi ffmpeg.wasm...");
    console.log("[FFmpeg] Loading core...");
    // coreURL/wasmURL cùng origin + classWorkerURL tường minh:
    // - không phụ thuộc CDN (unpkg/jsdelivr) vào thời điểm runtime
    // - không đi qua blob URL (tránh lỗi import()/fetch() blob trong module worker)
    // - worker được Vite serve như file tĩnh trong public/, không đi qua dep-optimizer
    //   (dep-optimizer từng trả ra /node_modules/.vite/deps/worker.js bị 404/COEP-block
    //   khiến @ffmpeg/ffmpeg không có onerror → ffmpeg.load() treo vĩnh viễn).
    await withTimeout(
      ffmpeg.load({
        coreURL: CORE_JS_URL,
        wasmURL: CORE_WASM_URL,
        classWorkerURL: FFMPEG_WORKER_URL,
      }),
      TIMEOUT.CORE_LOAD,
      "Khởi động ffmpeg.wasm"
    );

    onStatus?.("Đang chờ ffmpeg.wasm sẵn sàng...");
    // Probe -version: xác nhận worker + core đã chạy thực sự, không chỉ "loaded".
    await runFfmpegCommand(ffmpeg, ["-version"], {
      timeoutMs: 20_000,
      stageName: "Khởi động ffmpeg.wasm",
    });
    console.log("[FFmpeg] FFmpeg ready");
  } catch (err) {
    // Khi worker lỗi/thời gian chờ, hủy worker đang kẹt để lần thử sau bắt đầu
    // hoàn toàn sạch (nếu không, promise treo có thể giữ worker chạy nền vĩnh viễn).
    try {
      ffmpeg.terminate();
    } catch {
      /* terminate có thể ném nếu worker chưa tồn tại — bỏ qua */
    }
    const detail = describeError(err);
    console.error("[FFmpeg] Initialization failed:", err);
    throw new ExportError(
      "Không khởi động được ffmpeg.wasm.\n" +
        `- coreURL: ${CORE_JS_URL}\n` +
        `- wasmURL: ${CORE_WASM_URL}\n` +
        `- workerURL: ${FFMPEG_WORKER_URL}\n` +
        `- Thời gian chờ tối đa: ${Math.round(TIMEOUT.CORE_LOAD / 1000)}s\n` +
        `- Lỗi gốc: ${detail}`,
      "Khởi động ffmpeg.wasm"
    );
  }

  return ffmpeg;
}

export async function getFFmpeg(onStatus) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = createFFmpeg(onStatus)
    .then((ffmpeg) => {
      ffmpegInstance = ffmpeg;
      loadingPromise = null;
      return ffmpeg;
    })
    .catch((err) => {
      // Thất bại 1 lần không được làm tê liệt mọi lần xuất về sau — cho phép thử lại.
      loadingPromise = null;
      throw err;
    });

  return loadingPromise;
}

async function ensureFont(ffmpeg, onStatus) {
  // Font chỉ thực sự cần khi có overlay chữ (caller quyết định gọi hàm này).
  // Cache: chỉ lưu kết quả khi tải thành công; nếu thất bại sẽ reset để lần xuất
  // sau có cơ hội thử lại (font tĩnh được (re)build mỗi lần).
  if (fontLoaded && fontUsable) return true;
  onStatus?.("Đang tải font cho chữ overlay...");
  try {
    // Dùng fetch trực tiếp (không qua fetchFile) để được kiểm tra res.ok: nếu
    // fetchFile dùng thì HTTP lỗi (404) vẫn trả về body lỗi dưới dạng bytes và
    // được ghi vào VFS thành "font" — sau đó drawtext sẽ bỏ qua chữ im lặng.
    const res = await withTimeout(
      fetch(FONT_URL),
      TIMEOUT.FONT_LOAD,
      "Tải font chữ overlay"
    );
    if (!res.ok) {
      const statusText = (res.statusText || "").trim();
      throw new ExportError(
        `Tải font overlay thất bại: HTTP ${res.status}${statusText ? ` ${statusText}` : ""}. ` +
          `File "${FONT_URL}" không tồn tại hoặc trả về lỗi — chữ overlay sẽ bị thiếu.`,
        "Tải font chữ overlay"
      );
    }
    const fontData = new Uint8Array(await res.arrayBuffer());
    await withTimeout(
      ffmpeg.writeFile("overlay-font.ttf", fontData),
      TIMEOUT.WRITE_FILE,
      "Ghi font chữ overlay"
    );
    fontLoaded = true;
    fontUsable = true;
    return true;
  } catch (err) {
    // Không im lặng: ném ExportError để caller báo lỗi rõ ràng thay vì bỏ qua.
    fontLoaded = false;
    fontUsable = false;
    throw err instanceof ExportError
      ? err
      : new ExportError(
          `Không tải được font overlay từ "${FONT_URL}". ` +
            `Chữ overlay sẽ không xuất hiện trong video.\nLỗi: ${describeError(err)}`,
          "Tải font chữ overlay"
        );
  }
}

function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

function overlayYExpr(position) {
  if (position === "top") return "40";
  if (position === "bottom") return "h-text_h-40";
  return "(h-text_h)/2";
}

function buildDrawtextFilters(overlays) {
  if (!overlays || overlays.length === 0) return [];
  return overlays.map((ov) => {
    const text = escapeDrawtext(ov.text || "");
    const y = overlayYExpr(ov.position);
    return (
      `drawtext=fontfile=overlay-font.ttf:text='${text}':` +
      `fontsize=${ov.fontSize || 36}:fontcolor=${ov.color || "#ffffff"}:` +
      `box=1:boxcolor=black@0.45:boxborderw=10:` +
      `x=(w-text_w)/2:y=${y}:` +
      `enable='between(t,${ov.start},${ov.end})'`
    );
  });
}

function extOf(filename) {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : ".mp4";
}

const EXPORT_DIMENSIONS = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
};

function resolveDimensions(aspectRatio) {
  return EXPORT_DIMENSIONS[aspectRatio] || EXPORT_DIMENSIONS["16:9"];
}

/**
 * Cắt 1 clip theo sourceStart/sourceEnd, chuẩn hoá độ phân giải/fps,
 * gắn chữ overlay. Trả về tên file trong FS ảo của ffmpeg.
 */
async function renderClip(ffmpeg, clip, useFont, onStatus, { width, height }) {
  const inputName = `src_${clip.id}${extOf(clip.file.name)}`;
  const outputName = `trim_${clip.id}.mp4`;
  const duration = Math.max(0.1, clip.sourceEnd - clip.sourceStart);

  onStatus?.(`Đang xử lý clip "${clip.name}"...`);
  const fileData = await fetchFile(clip.file);
  await withTimeout(
    ffmpeg.writeFile(inputName, fileData),
    TIMEOUT.WRITE_FILE,
    `Ghi file "${clip.name}"`
  );

  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1",
    "fps=30",
  ];
  if (useFont) filters.push(...buildDrawtextFilters(clip.overlays));

  await runFfmpegCommand(
    ffmpeg,
    [
      "-ss", String(clip.sourceStart),
      "-i", inputName,
      "-t", String(duration),
      "-vf", filters.join(","),
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-c:a", "aac",
      "-ar", "44100",
      "-ac", "2",
      outputName,
    ],
    { timeoutMs: TIMEOUT.clipRender(duration), stageName: `Xử lý clip "${clip.name}"` }
  );

  await ffmpeg.deleteFile(inputName).catch(() => {});
  return outputName;
}

/**
 * Export multi-track: mỗi track được ghép thành 1 lớp trong suốt (alpha)
 * trải dài toàn bộ timeline, các clip trong track được đặt đúng vị trí
 * bằng setpts + overlay(enable=between(...)). Sau đó các track được chồng
 * lớp lên nhau từ dưới lên trên (tracks[0] = dưới cùng) lên 1 nền đen.
 * Audio của mọi clip được trễ đúng thời điểm (adelay) rồi trộn (amix).
 *
 * tracks: [{ id, name }]  (thứ tự mảng = thứ tự lớp, phần tử cuối ở trên cùng)
 * clips: [{ id, trackId, file, name, sourceStart, sourceEnd, timelineStart, overlays }]
 */
export async function exportTimeline(tracks, clips, aspectRatio = "16:9", onStatus, onProgress) {
  if (clips.length === 0) throw new Error("Chưa có clip nào trên timeline.");

  // Bắt đầu 1 lần xuất mới: xoá log cũ, cắm sink progress cho lần xuất này.
  logBuffer.length = 0;
  let stageIndex = 0;
  const totalStages = clips.length + 1; // mỗi clip là 1 giai đoạn + giai đoạn ghép cuối
  const onProgressEvent = (raw) => {
    if (typeof raw !== "number" || totalStages === 0) return;
    const fraction = Math.min(1, Math.max(0, raw));
    const overall = Math.min(99, Math.round(((stageIndex + fraction) / totalStages) * 100));
    onProgress?.(overall);
  };
  progressSink = onProgress ? onProgressEvent : null;

  let ffmpeg;
  try {
    ffmpeg = await getFFmpeg(onStatus);
  } catch (err) {
    progressSink = null;
    logBuffer.length = 0;
    throw new ExportError(
      `Không khởi động được bộ xử lý video: ${describeError(err)}`,
      "Khởi động ffmpeg.wasm"
    );
  }

  try {
        // Font overlay chỉ cần khi có ít nhất 1 clip mang text. Nếu tải lỗi,
    // ensureFont ném ExportError (giai đoạn "Tải font chữ overlay") để báo cho
    // người dùng thay vì bỏ qua chữ overlay một cách im lặng.
    const useFont = clips.some((c) => c.overlays?.length)
      ? await ensureFont(ffmpeg, onStatus)
      : false;

    const { width, height } = resolveDimensions(aspectRatio);

    const totalDuration = clips.reduce(
      (max, c) => Math.max(max, c.timelineStart + (c.sourceEnd - c.sourceStart)),
      0.5
    );

    // 1) render từng clip riêng lẻ (cắt + overlay)
    const inputArgs = [];
    const clipWithIndex = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      stageIndex = i;
      const name = await renderClip(ffmpeg, clip, useFont, onStatus, { width, height });
      inputArgs.push("-i", name);
      clipWithIndex.push({ ...clip, inputIndex: i, fileName: name });
    }

  onStatus?.("Đang ghép lớp các track...");

  const filterParts = [];

  // 2) mỗi track -> 1 lớp trong suốt trải toàn bộ timeline
  const trackLabels = [];
  tracks.forEach((track, tIdx) => {
    const base = `tb${tIdx}_0`;
    filterParts.push(
      `color=c=black@0.0:s=${width}x${height}:d=${totalDuration.toFixed(3)}:r=30,format=yuva420p[${base}]`
    );
    let prev = base;
    const trackClips = clipWithIndex
      .filter((c) => c.trackId === track.id)
      .sort((a, b) => a.timelineStart - b.timelineStart);

    trackClips.forEach((clip, ci) => {
      const shifted = `tb${tIdx}_ov${ci}`;
      filterParts.push(
        `[${clip.inputIndex}:v]setpts=PTS-STARTPTS+${clip.timelineStart.toFixed(3)}/TB[${shifted}]`
      );
      const len = clip.sourceEnd - clip.sourceStart;
      const next = `tb${tIdx}_${ci + 1}`;
      filterParts.push(
        `[${prev}][${shifted}]overlay=x=0:y=0:enable='between(t,${clip.timelineStart.toFixed(3)},${(
          clip.timelineStart + len
        ).toFixed(3)})'[${next}]`
      );
      prev = next;
    });
    trackLabels.push(prev);
  });

  // 3) chồng các track lên 1 nền đen, từ dưới (tracks[0]) lên trên
  filterParts.push(`color=c=black:s=${width}x${height}:d=${totalDuration.toFixed(3)}:r=30[canvas0]`);
  let prevCanvas = "canvas0";
  trackLabels.forEach((label, i) => {
    const next = `canvas${i + 1}`;
    filterParts.push(`[${prevCanvas}][${label}]overlay=x=0:y=0[${next}]`);
    prevCanvas = next;
  });
  const finalVideo = prevCanvas;

  // 4) audio: trễ đúng thời điểm rồi trộn tất cả
  const audioLabels = [];
  clipWithIndex.forEach((clip) => {
    const delayMs = Math.max(0, Math.round(clip.timelineStart * 1000));
    const label = `aa${clip.id}`;
    filterParts.push(`[${clip.inputIndex}:a]adelay=${delayMs}|${delayMs}[${label}]`);
    audioLabels.push(`[${label}]`);
  });
  let finalAudio = "aout";
  if (audioLabels.length > 0) {
    filterParts.push(
      `${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`
    );
  } else {
    filterParts.push(`anullsrc=r=44100:cl=stereo:d=${totalDuration.toFixed(3)}[aout]`);
  }

  const filterComplex = filterParts.join(";");

    // 3) chạy lệnh ghép lớp + mã hoá — có timeout (hết giờ = lỗi rõ ràng) và
    //    kiểm tra mã trả về để lỗi ffmpeg không còn "im lặng".
    stageIndex = clips.length;
    await runFfmpegCommand(
      ffmpeg,
      [
        ...inputArgs,
        "-filter_complex", filterComplex,
        "-map", `[${finalVideo}]`,
        "-map", `[${finalAudio}]`,
        "-t", totalDuration.toFixed(3),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-c:a", "aac",
        "output.mp4",
      ],
      { timeoutMs: TIMEOUT.compose(totalDuration), stageName: "Ghép lớp và xuất file" }
    );

    onStatus?.("Đang xuất file...");
    let data;
    try {
      data = await withTimeout(ffmpeg.readFile("output.mp4"), TIMEOUT.READ_FILE, "Đọc file kết quả");
    } catch (err) {
      if (err instanceof ExportError) throw err;
      const tail = logTail();
      throw new ExportError(
        `Bước «Đọc file kết quả» thất bại: ${describeError(err)}${tail ? `\n${tail}` : ""}`,
        "Đọc file kết quả"
      );
    }
    if (!data || data.byteLength === 0) {
      throw new ExportError(
        "Bước «Ghép lớp và xuất file» kết thúc nhưng không tạo được nội dung video.",
        "Đọc file kết quả"
      );
    }

    for (const c of clipWithIndex) {
      await ffmpeg.deleteFile(c.fileName).catch(() => {});
    }
    await ffmpeg.deleteFile("output.mp4").catch(() => {});

    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return new Blob([buffer], { type: "video/mp4" });
  } finally {
    progressSink = null;
    logBuffer.length = 0;
  }
}
