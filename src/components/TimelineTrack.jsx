import { memo, useMemo } from "react";
import TimelineClip from "./TimelineClip.jsx";
import { TRACK_HEIGHT } from "../timeline/constants.js";

const TimelineTrack = memo(function TimelineTrack({
  track,
  trackIndex,
  contentWidth,
  selectedClipIds,
  visibleClipIds,
  getClipLeft,
  getClipWidth,
  onClipSelect,
  onRemoveTrack,
  canRemoveTrack,
  showLabel,
}) {
  const selectedSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);

  if (showLabel) {
    return (
      <div className="track-label" style={{ height: TRACK_HEIGHT }} data-track-id={track.id}>
        <span className="track-label-name" title={track.name}>
          {track.name}
        </span>
        <span className="track-type-badge dim">{track.type}</span>
        {canRemoveTrack && (
          <button type="button" className="track-remove" onClick={() => onRemoveTrack(track.id)}>
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`timeline-track-row ${trackIndex % 2 === 1 ? "track-row-alt" : ""}`}
      style={{ top: trackIndex * TRACK_HEIGHT, height: TRACK_HEIGHT, width: contentWidth }}
      data-track-id={track.id}
    >
      <div
        className={`track-lane track-lane-${track.type}`}
        style={{ height: TRACK_HEIGHT, width: contentWidth }}
      />

      {track.clips.length === 0 && (
        <div className="track-empty dim" style={{ width: contentWidth }}>
          Track trống
        </div>
      )}

      {track.clips.map((clip) => {
        if (!visibleClipIds.has(clip.id)) return null;
        return (
          <TimelineClip
            key={clip.id}
            clip={clip}
            left={getClipLeft(clip)}
            width={Math.max(6, getClipWidth(clip))}
            selected={selectedSet.has(clip.id)}
            onSelect={onClipSelect}
          />
        );
      })}
    </div>
  );
});

export default TimelineTrack;
