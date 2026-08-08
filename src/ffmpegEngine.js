import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/static/NotoSans-Regular.ttf";

let ffmpegInstance = null;
let loadingPromise = null;
let fontLoaded = false;
let fontUsable = false;

export async function getFFmpeg(onLog) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));

    const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm");
    await ffmpeg.load({ coreURL, wasmURL });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadingPromise;
}

async function ensureFont(ffmpeg, onStatus) {
  if (fontLoaded) return fontUsable;
  fontLoaded = true;
  try {
    onStatus?.("Đang tải font cho chữ overlay...");
    const fontData = await fetchFile(FONT_URL);
    await ffmpeg.writeFile("overlay-font.ttf", fontData);
    fontUsable = true;
  } catch (err) {
    console.warn("Không tải được font overlay:", err);
    fontUsable = false;
  }
  return fontUsable;
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

/**
 * Cắt 1 clip theo sourceStart/sourceEnd, chuẩn hoá độ phân giải/fps,
 * gắn chữ overlay. Trả về tên file trong FS ảo của ffmpeg.
 */
async function renderClip(ffmpeg, clip, useFont, onStatus) {
  const inputName = `src_${clip.id}${extOf(clip.file.name)}`;
  const outputName = `trim_${clip.id}.mp4`;
  const duration = Math.max(0.1, clip.sourceEnd - clip.sourceStart);

  onStatus?.(`Đang xử lý clip "${clip.name}"...`);
  await ffmpeg.writeFile(inputName, await fetchFile(clip.file));

  const filters = [
    "scale=1280:720:force_original_aspect_ratio=decrease",
    "pad=1280:720:(ow-iw)/2:(oh-ih)/2",
    "setsar=1",
    "fps=30",
  ];
  if (useFont) filters.push(...buildDrawtextFilters(clip.overlays));

  await ffmpeg.exec([
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
  ]);

  await ffmpeg.deleteFile(inputName);
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
export async function exportTimeline(tracks, clips, onStatus) {
  if (clips.length === 0) throw new Error("Chưa có clip nào trên timeline.");

  const ffmpeg = await getFFmpeg();
  const useFont = await ensureFont(ffmpeg, onStatus);
  if (!useFont && clips.some((c) => c.overlays?.length)) {
    onStatus?.("Không tải được font — bỏ qua chữ overlay...");
  }

  const totalDuration = clips.reduce(
    (max, c) => Math.max(max, c.timelineStart + (c.sourceEnd - c.sourceStart)),
    0.5
  );

  // 1) render từng clip riêng lẻ (cắt + overlay)
  const inputArgs = [];
  const clipWithIndex = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const name = await renderClip(ffmpeg, clip, useFont, onStatus);
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
      `color=c=black@0.0:s=1280x720:d=${totalDuration.toFixed(3)}:r=30,format=yuva420p[${base}]`
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
  filterParts.push(`color=c=black:s=1280x720:d=${totalDuration.toFixed(3)}:r=30[canvas0]`);
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

  await ffmpeg.exec([
    ...inputArgs,
    "-filter_complex", filterComplex,
    "-map", `[${finalVideo}]`,
    "-map", `[${finalAudio}]`,
    "-t", totalDuration.toFixed(3),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-c:a", "aac",
    "output.mp4",
  ]);

  onStatus?.("Đang xuất file...");
  const data = await ffmpeg.readFile("output.mp4");

  for (const c of clipWithIndex) {
    await ffmpeg.deleteFile(c.fileName).catch(() => {});
  }
  await ffmpeg.deleteFile("output.mp4").catch(() => {});

  return new Blob([data.buffer], { type: "video/mp4" });
}
