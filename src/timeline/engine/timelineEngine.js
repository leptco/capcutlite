import { TRACK_HEIGHT } from "../constants.js";
import { toFiniteNumber } from "../utils/time.js";

/** Converts a timeline timestamp to a horizontal position in pixels. */
export function timeToPixels(time, pixelsPerSecond) {
  return toFiniteNumber(time) * Math.max(0, toFiniteNumber(pixelsPerSecond));
}

/** Converts a horizontal position in pixels to a timeline timestamp. */
export function pixelsToTime(pixels, pixelsPerSecond) {
  const scale = Math.max(0, toFiniteNumber(pixelsPerSecond));
  return scale === 0 ? 0 : toFiniteNumber(pixels) / scale;
}

export function getClipLeft(clip, pixelsPerSecond) {
  return timeToPixels(clip.start, pixelsPerSecond);
}

export function getClipWidth(clip, pixelsPerSecond) {
  return timeToPixels(Math.max(0, toFiniteNumber(clip.duration)), pixelsPerSecond);
}

export function getTrackTop(trackIndex, trackHeight = TRACK_HEIGHT) {
  return Math.max(0, toFiniteNumber(trackIndex)) * Math.max(0, toFiniteNumber(trackHeight));
}
