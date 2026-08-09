export default function ExportBar({ clips, exportState, onExport }) {
  const disabled = clips.length === 0 || exportState.status === "working";

  return (
    <div className="export-bar">
      <div className="export-info">
        {exportState.status === "idle" && (
          <span className="dim">{clips.length} clip trong dòng thời gian</span>
        )}
        {exportState.status === "working" && (
          <span className="pulse">
            {exportState.message}
            {typeof exportState.progress === "number" && (
              <span className="export-pct"> · {exportState.progress}%</span>
            )}
          </span>
        )}
        {exportState.status === "error" && (
          <span className="error-text">Lỗi: {exportState.message}</span>
        )}
        {exportState.status === "done" && (
          <a className="download-link" href={exportState.url} download="capcut-lite-export.mp4">
            ⬇ Tải video đã ghép
          </a>
        )}
        {exportState.status === "working" && (
          <div
            className="export-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={typeof exportState.progress === "number" ? exportState.progress : 0}
          >
            <div
              className="export-progress-fill"
              style={{ width: `${typeof exportState.progress === "number" ? exportState.progress : 0}%` }}
            />
          </div>
        )}
      </div>
      <button className="btn btn-accent" disabled={disabled} onClick={onExport}>
        {exportState.status === "working" ? "Đang xuất..." : "Xuất video"}
      </button>
    </div>
  );
}
