import { create } from "zustand";
import {
  DEFAULT_DURATION,
  DEFAULT_PIXELS_PER_SECOND,
  DEFAULT_VIEWPORT,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  TRACK_TYPE_VALUES,
} from "../constants.js";
import {
  createSingleSelection,
  getAllClipIds,
  getShiftRangeSelection,
  sanitizeSelection,
  toggleSelection,
} from "../engine/selectionEngine.js";
import { clamp, getTimelineDuration, toFiniteNumber } from "../utils/time.js";

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTrack(track = {}) {
  const type = TRACK_TYPE_VALUES.includes(track.type) ? track.type : "video";

  return {
    id: track.id || createId("track"),
    name: track.name || "Track",
    type,
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

function withDerivedTimelineState(tracks, currentTime, selectedClipIds) {
  const duration = getTimelineDuration(tracks);
  return {
    tracks,
    duration,
    currentTime: clamp(currentTime, 0, duration),
    selectedClipIds: sanitizeSelection(selectedClipIds, tracks),
  };
}

function hasClip(tracks, clipId) {
  return tracks.some((track) => track.clips.some((clip) => clip.id === clipId));
}

function getClipLocation(tracks, clipId) {
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const clipIndex = tracks[trackIndex].clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex !== -1) return { trackIndex, clipIndex, clip: tracks[trackIndex].clips[clipIndex] };
  }
  return null;
}

function sortClipsByStart(clips) {
  return [...clips].sort((first, second) => first.start - second.start);
}

/** UI-agnostic Zustand store for the timeline data model. */
export const useTimelineStore = create((set, get) => ({
  zoom: DEFAULT_ZOOM,
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
  currentTime: 0,
  duration: DEFAULT_DURATION,
  tracks: [],
  selectedClipIds: [],
  lastSelectedClipId: null,
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
      return withDerivedTimelineState(
        [...state.tracks, nextTrack],
        state.currentTime,
        state.selectedClipIds
      );
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
      const selectedClipIds = state.selectedClipIds.filter((id) => !removedClipIds.has(id));
      const lastSelectedClipId = removedClipIds.has(state.lastSelectedClipId)
        ? selectedClipIds.at(-1) || null
        : state.lastSelectedClipId;

      return {
        ...withDerivedTimelineState(tracks, state.currentTime, selectedClipIds),
        lastSelectedClipId,
      };
    });
    return removedClips;
  },

  updateTrack: (trackId, updates) =>
    set((state) => {
      if (!state.tracks.some((track) => track.id === trackId)) return state;
      const tracks = state.tracks.map((track) =>
        track.id === trackId
          ? normalizeTrack({ ...track, ...updates, id: trackId, clips: track.clips })
          : track
      );
      return withDerivedTimelineState(tracks, state.currentTime, state.selectedClipIds);
    }),

  getTrack: (trackId) => get().tracks.find((track) => track.id === trackId) || null,

  getTrackClips: (trackId) => get().tracks.find((track) => track.id === trackId)?.clips || [],

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
      return withDerivedTimelineState(tracks, state.currentTime, state.selectedClipIds);
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

      const selectedClipIds = state.selectedClipIds.filter((id) => id !== clipId);
      const lastSelectedClipId =
        state.lastSelectedClipId === clipId ? selectedClipIds.at(-1) || null : state.lastSelectedClipId;

      return {
        ...withDerivedTimelineState(tracks, state.currentTime, selectedClipIds),
        lastSelectedClipId,
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
      return withDerivedTimelineState(tracks, state.currentTime, state.selectedClipIds);
    }),

  /**
   * Move a clip to another track and/or timeline position.
   * Track ownership is intentionally handled here, never through updateClip().
   */
  moveClip: (clipId, targetTrackId, start) => {
    let movedClip = null;
    set((state) => {
      const location = getClipLocation(state.tracks, clipId);
      const targetTrackIndex = state.tracks.findIndex((track) => track.id === targetTrackId);
      if (!location || targetTrackIndex === -1) return state;

      const nextStart = Math.max(0, toFiniteNumber(start, location.clip.start));
      const nextClip = normalizeClip(
        { ...location.clip, id: clipId, start: nextStart },
        targetTrackId
      );
      movedClip = nextClip;

      if (location.trackIndex === targetTrackIndex) {
        const clips = [...state.tracks[location.trackIndex].clips];
        clips[location.clipIndex] = nextClip;
        const tracks = state.tracks.map((track, index) =>
          index === location.trackIndex ? { ...track, clips: sortClipsByStart(clips) } : track
        );
        return withDerivedTimelineState(tracks, state.currentTime, state.selectedClipIds);
      }

      const tracks = state.tracks.map((track, index) => {
        if (index === location.trackIndex) {
          return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) };
        }
        if (index === targetTrackIndex) {
          return { ...track, clips: sortClipsByStart([...track.clips, nextClip]) };
        }
        return track;
      });
      return withDerivedTimelineState(tracks, state.currentTime, state.selectedClipIds);
    });
    return movedClip;
  },

  selectClip: (clipId) =>
    set((state) => {
      if (!hasClip(state.tracks, clipId)) return state;
      return {
        selectedClipIds: createSingleSelection(clipId),
        lastSelectedClipId: clipId,
      };
    }),

  toggleClipSelection: (clipId) =>
    set((state) => {
      if (!hasClip(state.tracks, clipId)) return state;
      const selectedClipIds = toggleSelection(state.selectedClipIds, clipId);
      return {
        selectedClipIds,
        lastSelectedClipId: selectedClipIds.includes(clipId)
          ? clipId
          : selectedClipIds.at(-1) || null,
      };
    }),

  selectMultipleClips: (clipIds) =>
    set((state) => {
      const validIds = [...new Set(clipIds.filter((id) => hasClip(state.tracks, id)))];
      return {
        selectedClipIds: validIds,
        lastSelectedClipId: validIds.at(-1) || null,
      };
    }),

  selectClipRange: (anchorId, targetId) =>
    set((state) => {
      if (!hasClip(state.tracks, targetId)) return state;
      const rangeIds = getShiftRangeSelection(state.tracks, anchorId, targetId);
      if (!rangeIds) {
        return {
          selectedClipIds: createSingleSelection(targetId),
          lastSelectedClipId: targetId,
        };
      }
      return {
        selectedClipIds: rangeIds,
        lastSelectedClipId: targetId,
      };
    }),

  clearSelection: () => set({ selectedClipIds: [], lastSelectedClipId: null }),

  selectAllClips: () =>
    set((state) => {
      const allIds = getAllClipIds(state.tracks);
      return {
        selectedClipIds: allIds,
        lastSelectedClipId: allIds.at(-1) || null,
      };
    }),

  isClipSelected: (clipId) => get().selectedClipIds.includes(clipId),

  getSelectedClips: () => {
    const { tracks, selectedClipIds } = get();
    if (selectedClipIds.length === 0) return [];
    const selectedSet = new Set(selectedClipIds);
    return tracks.flatMap((track) => track.clips.filter((clip) => selectedSet.has(clip.id)));
  },

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
