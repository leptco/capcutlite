import { create } from "zustand";
import {
  DEFAULT_DURATION,
  DEFAULT_PIXELS_PER_SECOND,
  DEFAULT_VIEWPORT,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../constants.js";
import { clamp, getTimelineDuration, toFiniteNumber } from "../utils/time.js";

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTrack(track = {}) {
  return {
    id: track.id || createId("track"),
    name: track.name || "Track",
    type: track.type || "video",
    clips: Array.isArray(track.clips) ? track.clips : [],
  };
}

function normalizeClip(clip = {}, trackId) {
  const duration = Math.max(0, toFiniteNumber(clip.duration));
  const trimIn = Math.max(0, toFiniteNumber(clip.trimIn));

  return {
    ...clip,
    id: clip.id || createId("clip"),
    mediaId: clip.mediaId || null,
    trackId,
    type: clip.type || "video",
    start: Math.max(0, toFiniteNumber(clip.start)),
    duration,
    trimIn,
    trimOut: Math.max(trimIn, toFiniteNumber(clip.trimOut, trimIn + duration)),
  };
}

function withDerivedTimelineState(tracks, currentTime) {
  const duration = getTimelineDuration(tracks);
  return { tracks, duration, currentTime: clamp(currentTime, 0, duration) };
}

function hasClip(tracks, clipId) {
  return tracks.some((track) => track.clips.some((clip) => clip.id === clipId));
}

/** UI-agnostic Zustand store for the timeline data model. */
export const useTimelineStore = create((set) => ({
  zoom: DEFAULT_ZOOM,
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
  currentTime: 0,
  duration: DEFAULT_DURATION,
  tracks: [],
  selectedClipIds: [],
  viewport: { ...DEFAULT_VIEWPORT },

  setCurrentTime: (time) =>
    set((state) => {
      const currentTime = clamp(toFiniteNumber(time), 0, state.duration);
      return currentTime === state.currentTime ? state : { currentTime };
    }),

  setZoom: (zoom) =>
    set((state) => {
      const nextZoom = clamp(toFiniteNumber(zoom, DEFAULT_ZOOM), MIN_ZOOM, MAX_ZOOM);
      if (nextZoom === state.zoom) return state;
      return {
        zoom: nextZoom,
        pixelsPerSecond: (DEFAULT_PIXELS_PER_SECOND * nextZoom) / DEFAULT_ZOOM,
      };
    }),

  addTrack: (track) => {
    const nextTrack = normalizeTrack(track);
    set((state) => {
      if (state.tracks.some((item) => item.id === nextTrack.id)) return state;
      return withDerivedTimelineState([...state.tracks, nextTrack], state.currentTime);
    });
    return nextTrack.id;
  },

  removeTrack: (trackId) => {
    let removedClips = [];
    set((state) => {
      const removedTrack = state.tracks.find((track) => track.id === trackId);
      if (!removedTrack) return state;
      removedClips = removedTrack.clips;
      const tracks = state.tracks.filter((track) => track.id !== trackId);
      const removedClipIds = new Set(removedTrack.clips.map((clip) => clip.id));
      return {
        ...withDerivedTimelineState(tracks, state.currentTime),
        selectedClipIds: state.selectedClipIds.filter((id) => !removedClipIds.has(id)),
      };
    });
    return removedClips;
  },

  addClip: (clip) => {
    let clipId = null;
    set((state) => {
      const trackId = clip?.trackId;
      const targetTrack = state.tracks.find((track) => track.id === trackId);
      if (!targetTrack) return state;
      const nextClip = normalizeClip(clip, targetTrack.id);
      if (state.tracks.some((track) => track.clips.some((item) => item.id === nextClip.id))) return state;
      clipId = nextClip.id;
      const tracks = state.tracks.map((track) =>
        track.id === targetTrack.id ? { ...track, clips: [...track.clips, nextClip] } : track
      );
      return withDerivedTimelineState(tracks, state.currentTime);
    });
    return clipId;
  },

  removeClip: (clipId) => {
    let removedClip = null;
    set((state) => {
      const tracks = state.tracks.map((track) => {
        const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
        if (clipIndex === -1) return track;
        removedClip = track.clips[clipIndex];
        return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) };
      });
      if (!removedClip) return state;
      return {
        ...withDerivedTimelineState(tracks, state.currentTime),
        selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
      };
    });
    return removedClip;
  },

  updateClip: (clipId, patch) =>
    set((state) => {
      if (!hasClip(state.tracks, clipId)) return state;
      const tracks = state.tracks.map((track) => {
        const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
        if (clipIndex === -1) return track;
        const clips = [...track.clips];
        clips[clipIndex] = normalizeClip({ ...clips[clipIndex], ...patch, id: clipId }, track.id);
        return { ...track, clips };
      });
      return withDerivedTimelineState(tracks, state.currentTime);
    }),

  selectClip: (clipId, append = false) =>
    set((state) => {
      if (!hasClip(state.tracks, clipId)) return state;
      if (!append) return { selectedClipIds: [clipId] };
      return state.selectedClipIds.includes(clipId)
        ? state
        : { selectedClipIds: [...state.selectedClipIds, clipId] };
    }),

  clearSelection: () => set({ selectedClipIds: [] }),

  setViewport: (viewport) =>
    set((state) => {
      const nextViewport = {
        scrollX: Math.max(0, toFiniteNumber(viewport?.scrollX, state.viewport.scrollX)),
        scrollY: Math.max(0, toFiniteNumber(viewport?.scrollY, state.viewport.scrollY)),
      };
      return nextViewport.scrollX === state.viewport.scrollX && nextViewport.scrollY === state.viewport.scrollY
        ? state
        : { viewport: nextViewport };
    }),
}));
