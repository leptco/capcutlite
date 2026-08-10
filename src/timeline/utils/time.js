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
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = getClipEnd(clip);
      if (end > maxEnd) {
        maxEnd = end;
      }
    }
  }
  // Only use minimum for empty timeline; otherwise use actual max end time
  return maxEnd > 0 ? maxEnd : minimum;
}
