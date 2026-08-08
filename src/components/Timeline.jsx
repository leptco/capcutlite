import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TimelineTrack from "./TimelineTrack.jsx";
import { useTimeline } from "../timeline/hooks/useTimeline.js";
import { TRACK_HEIGHT } from "../timeline/constants.js";
import { isAdditiveSelectionKey } from "../timeline/utils/input.js";

const RENDER_BUFFER_PX = 400;

function fmtRuler(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function rulerStep(pxPerSecond) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of steps) {
    if (s * pxPerSecond >= 60) return s;
  }
  return 600;
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export default function Timeline() {
  const { state, actions, helpers } = useTimeline();
  const {
    tracks,
    selectedClipIds,
    lastSelectedClipId,
    currentTime: playhead,
    duration: totalDuration,
    pixelsPerSecond: pxPerSecond,
  } = state;
  const {
    setCurrentTime,
    setZoom,
    addTrack,
    removeTrack,
    selectClip,
    toggleClipSelection,
    selectClipRange,
    clearSelection,
    selectAllClips,
    setViewport,
  } = actions;
  const { getClipLeft, getClipWidth } = helpers;
  const scrollRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const contentWidth = Math.max((totalDuration + 30) * pxPerSecond, 800);
  const contentHeight = Math.max(tracks.length, 1) * TRACK_HEIGHT;

  useEffect(() => {
    const measureViewport = () => {
      const element = scrollRef.current;
      if (!element) return;
      setViewportSize({ width: element.clientWidth, height: element.clientHeight });
    };
    measureViewport();
    window.addEventListener("resize", measureViewport);
    return () => window.removeEventListener("resize", measureViewport);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;

      if (isAdditiveSelectionKey(event) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAllClips();
        return;
      }

      if (event.key === "Escape") {
        clearSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, selectAllClips]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport({ scrollX: el.scrollLeft, scrollY: el.scrollTop });
    setViewportSize((size) =>
      size.width === el.clientWidth && size.height === el.clientHeight
        ? size
        : { width: el.clientWidth, height: el.clientHeight }
    );
  };

  const zoomBy = (factor) => {
    const nextZoom = Math.min(400, Math.max(25, state.zoom * factor));
    const el = scrollRef.current;
    const anchorTime = el ? (el.scrollLeft + el.clientWidth / 2) / pxPerSecond : 0;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      if (el) el.scrollLeft = Math.max(0, anchorTime * (pxPerSecond * nextZoom / state.zoom) - el.clientWidth / 2);
    });
  };

  const seekAtPointer = useCallback(
    (e) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft;
      setCurrentTime(Math.max(0, x / pxPerSecond));
    },
    [pxPerSecond, setCurrentTime]
  );

  const seekOnClick = (e) => {
    if (e.button !== 0) return;
    seekAtPointer(e);
  };

  const handleClipSelect = useCallback(
    (event, clip) => {
      event.stopPropagation();

      if (event.shiftKey) {
        const anchorId = lastSelectedClipId || selectedClipIds[0];
        if (anchorId) {
          selectClipRange(anchorId, clip.id);
        } else {
          selectClip(clip.id);
        }
        return;
      }

      if (isAdditiveSelectionKey(event)) {
        toggleClipSelection(clip.id);
        return;
      }

      selectClip(clip.id);
    },
    [
      lastSelectedClipId,
      selectClip,
      selectClipRange,
      selectedClipIds,
      toggleClipSelection,
    ]
  );

  const handleRemoveTrack = useCallback(
    (trackId) => {
      const removedClips = removeTrack(trackId);
      removedClips.forEach((clip) => {
        if (clip.url) URL.revokeObjectURL(clip.url);
      });
    },
    [removeTrack]
  );

  const visibleClipIds = useMemo(() => {
    const visibleStartPx = state.viewport.scrollX - RENDER_BUFFER_PX;
    const visibleEndPx = state.viewport.scrollX + (viewportSize.width || 1000) + RENDER_BUFFER_PX;
    const ids = new Set();

    tracks.forEach((track) => {
      track.clips.forEach((clip) => {
        const left = clip.start * pxPerSecond;
        const right = (clip.start + clip.duration) * pxPerSecond;
        if (right >= visibleStartPx && left <= visibleEndPx) {
          ids.add(clip.id);
        }
      });
    });

    return ids;
  }, [pxPerSecond, state.viewport.scrollX, tracks, viewportSize.width]);

  const trackTop = state.viewport.scrollY - RENDER_BUFFER_PX;
  const trackBottom = state.viewport.scrollY + (viewportSize.height || 600) + RENDER_BUFFER_PX;

  const trackSharedProps = {
    selectedClipIds,
    visibleClipIds,
    getClipLeft,
    getClipWidth,
    onClipSelect: handleClipSelect,
    onRemoveTrack: handleRemoveTrack,
    canRemoveTrack: tracks.length > 1,
  };

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <button type="button" className="btn btn-small" onClick={() => zoomBy(0.7)}>
          − Zoom
        </button>
        <span className="dim small mono">{pxPerSecond}px/s</span>
        <button type="button" className="btn btn-small" onClick={() => zoomBy(1.4)}>
          + Zoom
        </button>
        <span className="timeline-spacer" />
        <button
          type="button"
          className="btn btn-small"
          onClick={() => addTrack({ name: `Track ${tracks.length + 1}`, type: "video" })}
        >
          + Thêm track
        </button>
        {selectedClipIds.length > 0 && (
          <span className="dim small mono">{selectedClipIds.length} clip đang chọn</span>
        )}
      </div>

      {tracks.length === 0 ? (
        <div className="timeline-empty dim">
          Chưa có track — bấm &quot;+ Thêm track&quot; hoặc thêm video để bắt đầu
        </div>
      ) : (
        <div className="timeline-body">
          <div className="timeline-track-labels" style={{ height: contentHeight }}>
            {tracks.map((track, trackIndex) => {
              if (trackIndex * TRACK_HEIGHT + TRACK_HEIGHT < trackTop || trackIndex * TRACK_HEIGHT > trackBottom) {
                return <div key={track.id} style={{ height: TRACK_HEIGHT }} />;
              }
              return (
                <TimelineTrack
                  key={track.id}
                  track={track}
                  trackIndex={trackIndex}
                  showLabel
                  {...trackSharedProps}
                />
              );
            })}
          </div>

          <div className="timeline-scroll" ref={scrollRef} onScroll={handleScroll}>
            <div className="timeline-ruler" style={{ width: contentWidth }} onPointerDown={seekOnClick}>
              {Array.from({ length: Math.ceil(totalDuration / rulerStep(pxPerSecond)) + 5 }).map((_, i) => {
                const t = i * rulerStep(pxPerSecond);
                return (
                  <span key={i} className="ruler-tick" style={{ left: t * pxPerSecond }}>
                    {fmtRuler(t)}
                  </span>
                );
              })}
            </div>

            <div
              className="timeline-tracks"
              style={{ width: contentWidth, height: contentHeight }}
              onPointerDown={seekOnClick}
            >
              {tracks.map((track, trackIndex) => (
                <TimelineTrack
                  key={track.id}
                  track={track}
                  trackIndex={trackIndex}
                  contentWidth={contentWidth}
                  {...trackSharedProps}
                />
              ))}

              <div
                className="timeline-playhead"
                style={{ left: playhead * pxPerSecond, height: contentHeight }}
                aria-label="Playhead"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
