import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TimelineClip from "./TimelineClip.jsx";
import { useTimeline } from "../timeline/hooks/useTimeline.js";
import { TRACK_HEIGHT } from "../timeline/constants.js";

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

export default function Timeline() {
  const { state, actions, helpers } = useTimeline();
  const { tracks, selectedClipIds, currentTime: playhead, duration: totalDuration, pixelsPerSecond: pxPerSecond } = state;
  const { setCurrentTime, setZoom, addTrack, removeTrack, selectClip, setViewport } = actions;
  const { getClipLeft, getClipWidth } = helpers;
  const scrollRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const contentWidth = Math.max((totalDuration + 30) * pxPerSecond, 800);
  const contentHeight = tracks.length * TRACK_HEIGHT;

  const clips = useMemo(
    () => tracks.flatMap((track, trackIndex) => track.clips.map((clip) => ({ ...clip, trackIndex }))),
    [tracks]
  );

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

  const seekAtPointer = useCallback((e) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    setCurrentTime(Math.max(0, x / pxPerSecond));
  }, [pxPerSecond, setCurrentTime]);

  const seekOnClick = (e) => {
    if (e.button !== 0) return;
    seekAtPointer(e);
  };

  const handleClipSelection = useCallback((event) => {
    event.stopPropagation();
    selectClip(event.currentTarget.dataset.clipId, event.metaKey || event.ctrlKey);
  }, [selectClip]);

  const handleRemoveTrack = useCallback((trackId) => {
    const removedClips = removeTrack(trackId);
    removedClips.forEach((clip) => {
      if (clip.url) URL.revokeObjectURL(clip.url);
    });
  }, [removeTrack]);

  const visibleClips = useMemo(() => {
    const visibleStartPx = state.viewport.scrollX - RENDER_BUFFER_PX;
    const visibleEndPx = state.viewport.scrollX + (viewportSize.width || 1000) + RENDER_BUFFER_PX;
    return clips.filter((clip) => {
      const left = clip.start * pxPerSecond;
      const right = (clip.start + clip.duration) * pxPerSecond;
      return right >= visibleStartPx && left <= visibleEndPx;
    });
  }, [clips, pxPerSecond, state.viewport.scrollX, viewportSize.width]);

  const trackTop = state.viewport.scrollY - RENDER_BUFFER_PX;
  const trackBottom = state.viewport.scrollY + (viewportSize.height || 600) + RENDER_BUFFER_PX;

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <button className="btn btn-small" onClick={() => zoomBy(0.7)}>
          − Zoom
        </button>
        <span className="dim small mono">{pxPerSecond}px/s</span>
        <button className="btn btn-small" onClick={() => zoomBy(1.4)}>
          + Zoom
        </button>
        <span className="timeline-spacer" />
        <button className="btn btn-small" onClick={() => addTrack({ name: `Track ${tracks.length + 1}` })}>
          + Thêm track
        </button>
      </div>

      <div className="timeline-body">
        <div className="timeline-track-labels" style={{ height: contentHeight }}>
          {tracks.map((t, i) => {
            if (i * TRACK_HEIGHT + TRACK_HEIGHT < trackTop || i * TRACK_HEIGHT > trackBottom) {
              return <div key={t.id} style={{ height: TRACK_HEIGHT }} />;
            }
            return (
              <div key={t.id} className="track-label" style={{ height: TRACK_HEIGHT }}>
                <span>{t.name}</span>
                {tracks.length > 1 && (
                  <button className="track-remove" onClick={() => handleRemoveTrack(t.id)}>
                    ×
                  </button>
                )}
              </div>
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

          <div className="timeline-tracks" style={{ width: contentWidth, height: contentHeight }} onPointerDown={seekOnClick}>
            {tracks.map((t, i) => (
              <div
                key={t.id}
                className="track-lane"
                style={{ top: i * TRACK_HEIGHT, height: TRACK_HEIGHT, width: contentWidth }}
              />
            ))}

            {visibleClips.map((clip) => {
              return (
                <div key={clip.id} style={{ position: "absolute", top: clip.trackIndex * TRACK_HEIGHT, left: 0, height: TRACK_HEIGHT }}>
                  <TimelineClip
                    clip={clip}
                    left={getClipLeft(clip)}
                    width={Math.max(6, getClipWidth(clip))}
                    selected={selectedClipIds.includes(clip.id)}
                    onClick={handleClipSelection}
                  />
                </div>
              );
            })}

            <div
              className="timeline-playhead"
              style={{ left: playhead * pxPerSecond, height: contentHeight }}
              aria-label="Playhead"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
