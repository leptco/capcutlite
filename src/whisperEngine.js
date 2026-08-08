import { env, pipeline } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = false;
env.allowLocalModels = false;

// Model nhỏ (~75MB) để tải nhanh; đổi sang "Xenova/whisper-base" hoặc
// "Xenova/whisper-small" trong 2 dòng dưới nếu muốn độ chính xác cao hơn
// (đổi cả nơi dùng WHISPER_MODEL bên dưới).
const WHISPER_MODEL = "Xenova/whisper-tiny";

let transcriberPromise = null;

function getTranscriber(onProgress) {
  if (!transcriberPromise) {
    transcriberPromise = pipeline(
      "automatic-speech-recognition",
      WHISPER_MODEL,
      {
        progress_callback: onProgress,
      },
    );
  }
  return transcriberPromise;
}

/**
 * Giải mã track âm thanh của 1 file video thành PCM mono 16kHz
 * (định dạng mà model Whisper cần).
 */
async function decodeAudio(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

  const targetRate = 16000;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * targetRate),
    targetRate,
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;

  // Trộn về mono nếu có nhiều kênh
  if (decoded.numberOfChannels > 1) {
    const merger = offlineCtx.createChannelMerger(1);
    const splitter = offlineCtx.createChannelSplitter(decoded.numberOfChannels);
    source.connect(splitter);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      splitter.connect(merger, ch, 0);
    }
    merger.connect(offlineCtx.destination);
  } else {
    source.connect(offlineCtx.destination);
  }

  source.start(0);
  const rendered = await offlineCtx.startRendering();
  await audioCtx.close();
  return rendered.getChannelData(0);
}

/**
 * Tạo phụ đề tự động cho 1 clip. Trả về danh sách đoạn dạng
 * [{ text, start, end }] với start/end tính bằng giây, TÍNH TỪ ĐẦU FILE GỐC
 * (chưa trừ điểm cắt trim).
 *
 * onProgress(message) để cập nhật trạng thái lên UI.
 */
export async function generateCaptions(
  file,
  onProgress,
  language = "vietnamese",
) {
  onProgress?.("Đang tải model nhận diện giọng nói (chỉ lần đầu)...");
  const transcriber = await getTranscriber((p) => {
    if (p.status === "progress") {
      onProgress?.(`Đang tải model... ${Math.round(p.progress || 0)}%`);
    }
  });

  onProgress?.("Đang giải mã âm thanh...");
  const audioData = await decodeAudio(file);

  onProgress?.("Đang nhận diện giọng nói...");
  const result = await transcriber(audioData, {
    language,
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  });

  const chunks = result.chunks || [];
  return chunks
    .filter((c) => c.timestamp && c.timestamp[0] != null)
    .map((c) => ({
      text: c.text.trim(),
      start: c.timestamp[0],
      end: c.timestamp[1] != null ? c.timestamp[1] : c.timestamp[0] + 2,
    }))
    .filter((c) => c.text.length > 0);
}
