export const DEFAULT_ZOOM = 100;
export const DEFAULT_PIXELS_PER_SECOND = 100;
export const DEFAULT_DURATION = 300;
export const DEFAULT_VIEWPORT = Object.freeze({ scrollX: 0, scrollY: 0 });

export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const TRACK_HEIGHT = 72;

export const TRACK_TYPES = Object.freeze({
  VIDEO: "video",
  AUDIO: "audio",
  TEXT: "text",
  SUBTITLE: "subtitle",
  OVERLAY: "overlay",
});

export const TRACK_TYPE_VALUES = Object.freeze(Object.values(TRACK_TYPES));
