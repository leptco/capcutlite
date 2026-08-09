import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Timeline from "./components/Timeline.jsx";
import Stage from "./components/Stage.jsx";
import OverlayPanel from "./components/OverlayPanel.jsx";
import ExportBar from "./components/ExportBar.jsx";
import { exportTimeline } from "./ffmpegEngine.js";
import { useTimelineSelector } from "./timeline/hooks/useTimeline.js";
import { useTimelineStore } from "./timeline/store/timelineStore.js";
import "./App.css";

let nextMediaId = 1;

function loadDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const metadataUrl = URL.createObjectURL(file);
    const finish = (duration) => {
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(metadataUrl);
      resolve(duration);
    };
    video.preload = "metadata";
    video.src = metadataUrl;
    video.onloadedmetadata = () => {
      finish(video.duration || 0);
    };
    video.onerror = () => finish(0);
  });
}

function fmtTime(time) {
  const minutes = Math.floor(time / 60);
  const seconds = (time % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
}

export default function App() {
  const tracks = useTimelineSelector((state) => state.tracks);
  const currentTime = useTimelineSelector((state) => state.currentTime);
  const duration = useTimelineSelector((state) => state.duration);
  const selectedClipIds = useTimelineSelector((state) => state.selectedClipIds);
  const addTrack = useTimelineSelector((state) => state.addTrack);
  const addClip = useTimelineSelector((state) => state.addClip);
  const removeClips = useTimelineSelector((state) => state.removeClips);
  const updateClip = useTimelineSelector((state) => state.updateClip);
  const selectClip = useTimelineSelector((state) => state.selectClip);
  const setCurrentTime = useTimelineSelector((state) => state.setCurrentTime);
  const aspectRatio = useTimelineSelector((state) => state.aspectRatio);
  const setAspectRatio = useTimelineSelector((state) => state.setAspectRatio);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportState, setExportState] = useState({
    status: "idle",
    message: "",
    url: null,
    progress: null,
  });
  const fileInputRef = useRef(null);
  const currentTimeRef = useRef(currentTime);
  const exportUrlRef = useRef(null);

  const clips = useMemo(() => tracks.flatMap((track) => track.clips), [tracks]);
  const selectedClip = useMemo(
    () =>
      selectedClipIds.length === 1
        ? clips.find((clip) => clip.id === selectedClipIds[0]) || null
        : null,
    [clips, selectedClipIds]
  );

  useEffect(() => {
    if (!isPlaying) return undefined;
    let frameId;
    let lastTime = performance.now();

    const play = (now) => {
      const nextTime = currentTimeRef.current + (now - lastTime) / 1000;
      lastTime = now;
      if (nextTime >= duration) {
        setCurrentTime(duration);
        setIsPlaying(false);
        return;
      }
      setCurrentTime(nextTime);
      frameId = requestAnimationFrame(play);
    };

    frameId = requestAnimationFrame(play);
    return () => cancelAnimationFrame(frameId);
  }, [duration, isPlaying, setCurrentTime]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const replaceExportUrl = useCallback((nextUrl) => {
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    exportUrlRef.current = nextUrl;
  }, []);

  useEffect(() => () => replaceExportUrl(null), [replaceExportUrl]);

  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList).filter((file) => file.type.startsWith("video/"));
      let targetTrackId = useTimelineStore.getState().tracks.at(-1)?.id;
      if (!targetTrackId) targetTrackId = addTrack({ name: "Track 1", type: "video" });

      for (const file of files) {
        const clipDuration = await loadDuration(file);
        if (clipDuration <= 0) continue;
        const track = useTimelineStore.getState().tracks.find((item) => item.id === targetTrackId);
        const start = (track?.clips || []).reduce(
          (latestEnd, clip) => Math.max(latestEnd, clip.start + clip.duration),
          0
        );
        const mediaId = `media-${nextMediaId++}`;
        const clipUrl = URL.createObjectURL(file);
        const clipId = addClip({
          mediaId,
          trackId: targetTrackId,
          type: "video",
          name: file.name,
          file,
          url: clipUrl,
          start,
          duration: clipDuration,
          trimIn: 0,
          trimOut: clipDuration,
          overlays: [],
        });
        if (!clipId) URL.revokeObjectURL(clipUrl);
        if (clipId && useTimelineStore.getState().selectedClipIds.length === 0) selectClip(clipId);
      }
    },
    [addClip, addTrack, selectClip]
  );

  const removeSelectedClips = useCallback(() => {
    if (selectedClipIds.length === 0) return;

    const removedClips = removeClips(selectedClipIds);

    removedClips.forEach((clip) => {
      if (clip.url) URL.revokeObjectURL(clip.url);
    });
  }, [selectedClipIds, removeClips]);

  const runExport = useCallback(async () => {
    if (clips.length === 0) return;
    setIsPlaying(false);
    replaceExportUrl(null);
    setExportState({ status: "working", message: "Đang khởi động bộ xử lý video...", url: null, progress: 0 });
    try {
      const exportClips = clips.map((clip) => ({
        ...clip,
        timelineStart: clip.start,
        sourceStart: clip.trimIn,
        sourceEnd: clip.trimIn + clip.duration,
      }));
      const blob = await exportTimeline(
        tracks,
        exportClips,
        aspectRatio,
        (message) => setExportState((previous) => ({ ...previous, message })),
        (progress) => setExportState((previous) => ({ ...previous, progress }))
      );
      const url = URL.createObjectURL(blob);
      replaceExportUrl(url);
      setExportState({ status: "done", message: "Hoàn tất!", url, progress: 100 });
    } catch (error) {
      console.error(error);
      setExportState({
        status: "error",
        message: String(error?.message || error),
        url: null,
        progress: null,
      });
    }
  }, [clips, replaceExportUrl, tracks]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-name">CapCut Lite</span>
        </div>
        <button className="btn btn-accent" onClick={() => fileInputRef.current?.click()}>
          + Thêm video
        </button>
        <div className="ratio-control" role="group" aria-label="Aspect Ratio">
          <button
            type="button"
            className={`ratio-option ${aspectRatio === "16:9" ? "active" : ""}`}
            onClick={() => setAspectRatio("16:9")}
          >
            <span className="ratio-value">16:9</span>
            <span className="ratio-label">Desktop</span>
          </button>
          <button
            type="button"
            className={`ratio-option ${aspectRatio === "9:16" ? "active" : ""}`}
            onClick={() => setAspectRatio("9:16")}
          >
            <span className="ratio-value">9:16</span>
            <span className="ratio-label">TikTok / Reels</span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </header>

      <main className="app-main">
        <div className="main-columns">
          <div className="stage-column">
            <Stage tracks={tracks} clips={clips} playhead={currentTime} isPlaying={isPlaying} aspectRatio={aspectRatio} />
            <div className="transport-bar">
              <button
                className="btn btn-accent btn-small"
                disabled={clips.length === 0}
                onClick={() => {
                  if (currentTime >= duration) setCurrentTime(0);
                  setIsPlaying((playing) => !playing);
                }}
              >
                {isPlaying ? "⏸ Tạm dừng" : "▶ Phát"}
              </button>
              <span className="mono transport-time">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
            </div>
          </div>
          <OverlayPanel clip={selectedClip} onChangeOverlays={(id, overlays) => updateClip(id, { overlays })} />
        </div>
      </main>

      <Timeline />

      <div className="strip-actions">
        <button className="btn btn-small" disabled={selectedClipIds.length === 0} onClick={removeSelectedClips}>
          🗑 Xoá clip đang chọn
        </button>
        {selectedClipIds.length > 1 && (
          <span className="dim small">
            Đã chọn {selectedClipIds.length} clip
          </span>
        )}
        <span className="dim small">Chọn video để thêm vào timeline. Phase 1.1 hiện chưa hỗ trợ kéo, trim, split hoặc snap.</span>
      </div>

      <ExportBar clips={clips} exportState={exportState} onExport={runExport} />
    </div>
  );
}
