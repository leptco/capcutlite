import { DEFAULT_DURATION } from "../constants.js";

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getClipEnd(clip) {
  return toFiniteNumber(clip.start) + Math.max(0, toFiniteNumber(clip.duration));
}

export function getTimelineDuration(tracks, minimum = DEFAULT_DURATION) {
  return tracks.reduce(
    (latestEnd, track) =>
      track.clips.reduce((end, clip) => Math.max(end, getClipEnd(clip)), latestEnd),
    minimum
  );
}
