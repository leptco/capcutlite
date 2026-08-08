import { useMemo } from "react";
import {
  getClipLeft,
  getClipWidth,
  getTrackTop,
  pixelsToTime,
  timeToPixels,
} from "../engine/timelineEngine.js";
import { useTimelineStore } from "../store/timelineStore.js";

/** Subscribe to one timeline slice when a component does not need the full API. */
export function useTimelineSelector(selector) {
  return useTimelineStore(selector);
}

/**
 * Convenience boundary for UI code. It exposes the store state/actions and
 * geometry helpers without giving the engine any knowledge of React or the DOM.
 */
export function useTimeline() {
  const timeline = useTimelineStore();

  return useMemo(
    () => ({
      state: {
        zoom: timeline.zoom,
        pixelsPerSecond: timeline.pixelsPerSecond,
        currentTime: timeline.currentTime,
        duration: timeline.duration,
        tracks: timeline.tracks,
        selectedClipIds: timeline.selectedClipIds,
        viewport: timeline.viewport,
      },
      actions: {
        setCurrentTime: timeline.setCurrentTime,
        setZoom: timeline.setZoom,
        addTrack: timeline.addTrack,
        removeTrack: timeline.removeTrack,
        addClip: timeline.addClip,
        removeClip: timeline.removeClip,
        updateClip: timeline.updateClip,
        selectClip: timeline.selectClip,
        clearSelection: timeline.clearSelection,
        setViewport: timeline.setViewport,
      },
      helpers: {
        timeToPixels: (time) => timeToPixels(time, timeline.pixelsPerSecond),
        pixelsToTime: (pixels) => pixelsToTime(pixels, timeline.pixelsPerSecond),
        getClipLeft: (clip) => getClipLeft(clip, timeline.pixelsPerSecond),
        getClipWidth: (clip) => getClipWidth(clip, timeline.pixelsPerSecond),
        getTrackTop,
      },
    }),
    [timeline]
  );
}
