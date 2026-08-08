import { useEffect, useRef } from "react";

function findActiveClip(clips, trackId, playhead) {
  return clips.find(
    (c) =>
      c.trackId === trackId &&
      playhead >= c.start &&
      playhead < c.start + c.duration
  );
}

export default function Stage({ tracks, clips, playhead, isPlaying }) {
  const videoRefs = useRef({});

  useEffect(() => {
    tracks.forEach((track) => {
      const el = videoRefs.current[track.id];
      if (!el) return;
      const activeClip = findActiveClip(clips, track.id, playhead);

      if (!activeClip) {
        if (!el.paused) el.pause();
        el.dataset.clipId = "";
        return;
      }

      const target = activeClip.trimIn + (playhead - activeClip.start);

      if (el.dataset.clipId !== String(activeClip.id)) {
        el.dataset.clipId = String(activeClip.id);
        el.src = activeClip.url;
        const onLoaded = () => {
          try {
            el.currentTime = target;
          } catch {
            /* ignore */
          }
          if (isPlaying) el.play().catch(() => {});
          el.removeEventListener("loadedmetadata", onLoaded);
        };
        el.addEventListener("loadedmetadata", onLoaded);
        return;
      }

      if (isPlaying) {
        if (el.paused) {
          el.currentTime = target;
          el.play().catch(() => {});
        } else if (Math.abs(el.currentTime - target) > 0.25) {
          el.currentTime = target;
        }
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.03) {
          el.currentTime = target;
        }
      }
    });
  }, [playhead, isPlaying, clips, tracks]);

  const activeOverlays = tracks.flatMap((track) => {
    const clip = findActiveClip(clips, track.id, playhead);
    if (!clip) return [];
    const relTime = playhead - clip.start;
    return (clip.overlays || [])
      .filter((ov) => relTime >= ov.start && relTime <= ov.end)
      .map((ov) => ({ ...ov, _key: `${clip.id}-${ov.id}` }));
  });

  return (
    <div className="stage">
      {tracks.map((track) => (
        <video
          key={track.id}
          ref={(el) => {
            if (el) videoRefs.current[track.id] = el;
          }}
          className="stage-video"
          muted={false}
          playsInline
        />
      ))}
      {activeOverlays.map((ov) => (
        <div key={ov._key} className={`overlay-preview pos-${ov.position}`}>
          <span style={{ fontSize: ov.fontSize * 0.6, color: ov.color }}>{ov.text}</span>
        </div>
      ))}
      {clips.length === 0 && <div className="stage-empty dim">Timeline trống — thêm video để bắt đầu</div>}
    </div>
  );
}
