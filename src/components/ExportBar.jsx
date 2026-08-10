export default function ExportBar({ clips, onExport }) {
  const disabled = clips.length === 0;

  return (
    <div className="export-bar">
      <div className="export-info">
        <span className="dim">{clips.length} clip trong dòng thời gian</span>
      </div>
      <button className="btn btn-accent" disabled={disabled} onClick={onExport}>
        Xuất video
      </button>
    </div>
  );
}
