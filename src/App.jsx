import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Timeline from "./components/Timeline.jsx";
import Stage from "./components/Stage.jsx";
import OverlayPanel from "./components/OverlayPanel.jsx";
import ExportBar from "./components/ExportBar.jsx";
import ExportSettingsModal from "./components/ExportSettingsModal.jsx";
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
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
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

  const handleExportStart = useCallback(() => {
    setIsExportModalOpen(true);
  }, []);

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

  const writeExportBlob = useCallback(
    async (blob, fileHandle, filename) => {
      if (fileHandle) {
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (writeError) {
          console.error("[Export] FileSystem write failed", writeError);
        }
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    []
  );

  const runExport = useCallback(
    async (options = {}) => {
      const {
        aspectRatio: exportAspectRatio = aspectRatio,
        resolution = "720p",
        filename: exportFilename = "capcut-lite-export.mp4",
        fileHandle,
        saveLocation,
        locationLabel,
        onProgress,
        onStatus,
        onComplete,
      } = options;

      if (clips.length === 0) return;
      setIsPlaying(false);
      replaceExportUrl(null);

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
          exportAspectRatio,
          (message) => {
            if (onStatus) onStatus(message);
          },
          (progress) => {
            if (onProgress) onProgress(progress);
          },
          resolution
        );

        const normalizedFilename = exportFilename.endsWith(".mp4")
          ? exportFilename
          : `${exportFilename}.mp4`;

        await writeExportBlob(blob, fileHandle, normalizedFilename);

        if (onComplete) {
          onComplete({
            success: true,
            filename: normalizedFilename,
            saveLocation: locationLabel || "Download",
          });
        }
      } catch (error) {
        console.error("[Export]", error);
        const message = error instanceof Error ? error.message : String(error);
        if (onComplete) {
          onComplete({
            success: false,
            error: message,
          });
        }
      }
    },
    [clips, replaceExportUrl, tracks, aspectRatio, writeExportBlob]
  );

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

      <ExportBar clips={clips} onExport={handleExportStart} />

      <ExportSettingsModal
        open={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onConfirm={runExport}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        tracks={tracks}
        clips={clips}
        currentTime={currentTime}
      />
    </div>
  );
}
