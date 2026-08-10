import { useState, useEffect, useRef } from "react";
import { EXPORT_RESOLUTIONS } from "../ffmpegEngine.js";
import Stage from "./Stage.jsx";

function finalizeFilename(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "capcut-lite-export.mp4";

  const hasExtension = trimmed.toLowerCase().endsWith(".mp4");
  const base = hasExtension ? trimmed.slice(0, -4) : trimmed;
  const cleaned = base
    .replace(/[<>:"/|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  if (!cleaned) return "capcut-lite-export.mp4";

  return `${cleaned}.mp4`;
}

export default function ExportSettingsModal({
  open,
  onClose,
  onConfirm,
  aspectRatio,
  setAspectRatio,
  tracks,
  clips,
  currentTime,
}) {
  const [exportAspectRatio, setExportAspectRatio] = useState(aspectRatio);
  const [resolution, setResolution] = useState("720p");
  const [rawFilename, setRawFilename] = useState("capcut-lite-export");
  const [modalPhase, setModalPhase] = useState("idle"); // idle | exporting | success | error
  const [exportProgress, setExportProgress] = useState(null);
  const [exportStatus, setExportStatus] = useState("");
  const [exportError, setExportError] = useState("");
  const [finalFilename, setFinalFilename] = useState("");
  const [finalLocation, setFinalLocation] = useState("");
  const [saveLocation, setSaveLocation] = useState("download");
  const [locationLabel, setLocationLabel] = useState("Download");
  const fileHandleRef = useRef(null);

  useEffect(() => {
    if (open) {
      setExportAspectRatio(aspectRatio);
      setResolution("720p");
      setRawFilename("capcut-lite-export");
      setModalPhase("idle");
      setExportProgress(null);
      setExportStatus("");
      setExportError("");
      setFinalFilename("");
      setFinalLocation("");
      setSaveLocation("download");
      setLocationLabel("Download");
      fileHandleRef.current = null;
    }
  }, [open, aspectRatio]);

  if (!open) return null;

  const resolutionOptions = EXPORT_RESOLUTIONS[exportAspectRatio] || EXPORT_RESOLUTIONS["16:9"];
  const isExporting = modalPhase === "exporting";
  const showSuccess = modalPhase === "success";
  const showError = modalPhase === "error";

  const handleAspectRatioChange = (next) => {
    setExportAspectRatio(next);
    setAspectRatio(next);
  };

  const handleFilenameChange = (value) => setRawFilename(value);

  const handleChooseLocation = async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: rawFilename ? `${rawFilename}.mp4` : "capcut-lite-export.mp4",
        types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
      });
      fileHandleRef.current = handle;
      setSaveLocation("custom");
      setLocationLabel("Custom location");
    } catch (pickerError) {
      if (pickerError.name !== "AbortError") console.error("[Export] showSaveFilePicker failed", pickerError);
    }
  };

  const handleOpenSavedLocation = async () => {
    const handle = fileHandleRef.current;
    if (!handle) {
      alert("Vị trí lưu mặc định là Download. Trình duyệt không thể mở thư mục Download trực tiếp.");
      return;
    }
    // Browsers intentionally do not expose the parent directory of a FileSystemFileHandle,
    // so there is no legitimate API to open the containing folder from a file handle.
    // We surface that limitation instead of faking a path or using file:// URLs.
    alert(
      "File đã lưu qua File System Access API.\n\n" +
      "Trình duyệt không hỗ trợ mở thư mục chứa file trực tiếp từ FileSystemFileHandle. " +
      "Vui lòng mở thủ công trong File Explorer / Finder."
    );
  };

  const handleExport = async () => {
    if (isExporting || clips.length === 0) return;
    setModalPhase("exporting");
    setExportProgress(0);
    setExportStatus("Đang khởi động bộ xử lý video...");
    setExportError("");

    try {
      await onConfirm({
        aspectRatio: exportAspectRatio,
        resolution,
        filename: finalizeFilename(rawFilename),
        fileHandle: fileHandleRef.current,
        saveLocation,
        locationLabel,
        onProgress: setExportProgress,
        onStatus: setExportStatus,
        onComplete: (result) => {
          if (result && result.success) {
            setFinalFilename(result.filename);
            setFinalLocation(result.saveLocation);
            setModalPhase("success");
          } else {
            setExportError(result?.error || "Không rõ lỗi");
            setModalPhase("error");
          }
        },
      });
    } catch (error) {
      console.error("[ExportSettingsModal]", error);
      setExportError(error instanceof Error ? error.message : String(error));
      setModalPhase("error");
    }
  };

  const handleRetry = () => {
    setModalPhase("idle");
    setExportError("");
    setExportProgress(null);
    setExportStatus("");
  };

  const handleClose = () => {
    if (isExporting) return;
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-content export-modal" onClick={(event) => event.stopPropagation()}>
        <div className="export-modal-header">
          <h2>Xuất video</h2>
          <button type="button" className="modal-close" onClick={handleClose} disabled={isExporting}>
            ×
          </button>
        </div>

        <div className="export-modal-body">
          <div className="export-preview-column">
            <div className="export-preview-wrapper">
              <Stage
                tracks={tracks}
                clips={clips}
                playhead={currentTime}
                isPlaying={false}
                aspectRatio={exportAspectRatio}
              />
            </div>
          </div>

          <div className="export-settings-column">
            <div className="setting-group">
              <label className="field-label" htmlFor="export-filename">Tên file</label>
              <input
                id="export-filename"
                className="filename-input"
                type="text"
                value={rawFilename}
                onChange={(event) => handleFilenameChange(event.target.value)}
                disabled={isExporting}
                spellCheck={false}
                placeholder="Nhập tên file (để trống sẽ dùng tên mặc định)"
              />
            </div>
<div className="setting-group">
              <span className="field-label">Vị trí lưu</span>
              <div className="save-location-row">
                <div className="save-location-display">
                  <span className="location-icon">📁</span>
                  <span className="location-text">{locationLabel}</span>
                </div>
                {"showSaveFilePicker" in window && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={handleChooseLocation}
                    disabled={isExporting}
                  >
                    Chọn vị trí
                  </button>
                )}
              </div>
              <span className="field-hint">
                Mặc định: Download
                {"showSaveFilePicker" in window && " · Bấm \"Chọn vị trí\" để đổi"}
              </span>
            </div>

            <div className="setting-group">
              <label className="field-label" htmlFor="resolution-select">Độ phân giải</label>
              <select
                id="resolution-select"
                className="resolution-select"
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                disabled={isExporting}
              >
                {Object.entries(resolutionOptions).map(([key, value]) => (
                  <option key={key} value={key}>
                    {key} — {value.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="setting-group">
              <span className="field-label">Tỷ lệ khung hình</span>
              <div className="aspect-ratio-options" role="group">
                <button
                  type="button"
                  className={`aspect-option ${exportAspectRatio === "16:9" ? "active" : ""}`}
                  onClick={() => handleAspectRatioChange("16:9")}
                  disabled={isExporting}
                >
                  <span className="aspect-value">16:9</span>
                  <span className="aspect-label">Desktop / YouTube</span>
                </button>
                <button
                  type="button"
                  className={`aspect-option ${exportAspectRatio === "9:16" ? "active" : ""}`}
                  onClick={() => handleAspectRatioChange("9:16")}
                  disabled={isExporting}
                >
                  <span className="aspect-value">9:16</span>
                  <span className="aspect-label">TikTok / Reels</span>
                </button>
              </div>
            </div>

            {isExporting && (
              <div className="export-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(exportProgress ?? 0, 100)}%` }}
                  />
                </div>
                <span className="progress-text">
                  {exportStatus}
                  {exportProgress != null && ` · ${Math.round(exportProgress)}%`}
                </span>
              </div>
            )}

            {showSuccess && (
              <div className="export-success">
                <span className="success-icon">✓</span>
                <div className="success-details">
                  <div className="success-title">Xuất video thành công</div>
                  <div className="success-file">{finalFilename || finalizeFilename(rawFilename)}</div>
                  <div className="success-location">Vị trí: {finalLocation || locationLabel}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={handleOpenSavedLocation}
                >
                  📁 Mở vị trí lưu
                </button>
              </div>
            )}

            {showError && (
              <div className="export-error">
                <span className="error-icon">✕</span>
                <div className="success-details">
                  <div className="error-title">Xuất video thất bại</div>
                  <div className="error-message">{exportError}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {showSuccess ? (
            <button type="button" className="btn btn-accent" onClick={handleClose}>
              Đóng
            </button>
          ) : showError ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={handleRetry} disabled={isExporting}>
                Thử lại
              </button>
              <button type="button" className="btn btn-accent" onClick={handleClose}>
                Đóng
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isExporting}>
                Huỷ
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={handleExport}
                disabled={isExporting || clips.length === 0}
              >
                {isExporting ? "Đang xuất..." : "Bắt đầu xuất"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}