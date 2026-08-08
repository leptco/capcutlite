import { useState } from "react";
import { generateCaptions } from "../whisperEngine.js";

let overlayId = 1;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

export default function OverlayPanel({ clip, onChangeOverlays }) {
  const [captionStatus, setCaptionStatus] = useState(null);

  if (!clip) return null;

  const trimmedDuration = Math.max(0, clip.duration);
  const overlays = clip.overlays || [];

  const addOverlay = () => {
    const next = [
      ...overlays,
      {
        id: overlayId++,
        text: "Chữ mới",
        start: 0,
        end: Math.min(3, trimmedDuration || 3),
        position: "bottom",
        fontSize: 36,
        color: "#ffffff",
      },
    ];
    onChangeOverlays(clip.id, next);
  };

  const updateOverlay = (id, patch) => {
    onChangeOverlays(
      clip.id,
      overlays.map((ov) => (ov.id === id ? { ...ov, ...patch } : ov))
    );
  };

  const removeOverlay = (id) => {
    onChangeOverlays(clip.id, overlays.filter((ov) => ov.id !== id));
  };

  const runAutoCaptions = async () => {
    setCaptionStatus("Đang khởi động...");
    try {
      const segments = await generateCaptions(clip.file, setCaptionStatus, "vietnamese");
      const converted = segments
        .map((seg) => ({
          id: overlayId++,
          text: seg.text,
          start: Math.max(0, seg.start - clip.trimIn),
          end: Math.min(trimmedDuration, seg.end - clip.trimIn),
          position: "bottom",
          fontSize: 30,
          color: "#ffffff",
        }))
        .filter((ov) => ov.end > ov.start);

      onChangeOverlays(clip.id, converted);
      setCaptionStatus(`Đã tạo ${converted.length} dòng phụ đề.`);
    } catch (err) {
      console.error(err);
      setCaptionStatus(`Lỗi: ${String(err?.message || err)}`);
    }
  };

  return (
    <div className="overlay-panel">
      <div className="overlay-panel-header">
        <span className="panel-title">Chữ overlay / Phụ đề</span>
        <div className="overlay-actions">
          <button className="btn btn-small" onClick={addOverlay}>
            + Thêm chữ
          </button>
          <button className="btn btn-small btn-outline" onClick={runAutoCaptions}>
            ✨ Tự động tạo phụ đề
          </button>
        </div>
      </div>

      {captionStatus && <p className="dim small">{captionStatus}</p>}

      {overlays.length === 0 && (
        <p className="dim small">Chưa có chữ nào. Bấm "+ Thêm chữ" hoặc dùng phụ đề tự động.</p>
      )}

      <div className="overlay-list">
        {overlays.map((ov) => (
          <div key={ov.id} className="overlay-item">
            <input
              className="overlay-text-input"
              type="text"
              value={ov.text}
              onChange={(e) => updateOverlay(ov.id, { text: e.target.value })}
            />
            <div className="overlay-row">
              <label>
                Từ
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={trimmedDuration}
                  value={ov.start}
                  onChange={(e) => updateOverlay(ov.id, { start: parseFloat(e.target.value) || 0 })}
                />
              </label>
              <label>
                Đến
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={trimmedDuration}
                  value={ov.end}
                  onChange={(e) => updateOverlay(ov.id, { end: parseFloat(e.target.value) || 0 })}
                />
              </label>
              <label>
                Vị trí
                <select
                  value={ov.position}
                  onChange={(e) => updateOverlay(ov.id, { position: e.target.value })}
                >
                  <option value="top">Trên</option>
                  <option value="middle">Giữa</option>
                  <option value="bottom">Dưới</option>
                </select>
              </label>
              <label>
                Cỡ chữ
                <input
                  type="number"
                  min={12}
                  max={96}
                  value={ov.fontSize}
                  onChange={(e) => updateOverlay(ov.id, { fontSize: parseInt(e.target.value) || 36 })}
                />
              </label>
              <label>
                Màu
                <input
                  type="color"
                  value={ov.color}
                  onChange={(e) => updateOverlay(ov.id, { color: e.target.value })}
                />
              </label>
              <button className="clip-remove static" onClick={() => removeOverlay(ov.id)}>
                ×
              </button>
            </div>
            <span className="dim small mono">
              {formatTime(ov.start)} → {formatTime(ov.end)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
