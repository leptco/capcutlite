import { memo } from "react";

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const TimelineClip = memo(function TimelineClip({ clip, left, width, selected, onClick }) {
  const isAudioOnly = clip.type === "audio";

  return (
    <div
      className={`tl-clip ${selected ? "selected" : ""} ${isAudioOnly ? "tl-clip-audio" : ""}`}
      style={{ left, width }}
      data-clip-id={clip.id}
      onClick={onClick}
      title={clip.name}
    >
      <div className="tl-clip-label">
        <span className="tl-clip-name">{clip.name || clip.mediaId || "Untitled clip"}</span>
        <span className="tl-clip-dur mono">{fmt(clip.duration)}</span>
      </div>
    </div>
  );
});

export default TimelineClip;
