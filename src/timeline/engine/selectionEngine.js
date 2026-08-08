/**
 * Pure selection helpers — no Zustand or React dependencies.
 * Used by timelineStore and (later) marquee selection UI.
 */

/** Replace selection with a single clip. */
export function createSingleSelection(clipId) {
  return clipId ? [clipId] : [];
}

/** Toggle one clip in/out of the current selection set. */
export function toggleSelection(selectedIds, clipId) {
  if (!clipId) return selectedIds;
  if (selectedIds.includes(clipId)) {
    return selectedIds.filter((id) => id !== clipId);
  }
  return [...selectedIds, clipId];
}

export function isSelected(selectedIds, clipId) {
  return selectedIds.includes(clipId);
}

/**
 * Return clip IDs between two indices (inclusive) in the provided ordered list.
 * Indices refer to positions in track.clips array order.
 */
export function selectRange(clipIds, startIndex, endIndex) {
  if (!clipIds.length) return [];
  const start = Math.max(0, Math.min(startIndex, endIndex));
  const end = Math.min(clipIds.length - 1, Math.max(startIndex, endIndex));
  return clipIds.slice(start, end + 1);
}

/**
 * Range selection on one track, following clip array order.
 * Returns null when anchor or target is not on the track.
 */
export function getSelectedIdsInRange(trackClipIds, anchorId, targetId) {
  const anchorIndex = trackClipIds.indexOf(anchorId);
  const targetIndex = trackClipIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) return null;
  return selectRange(trackClipIds, anchorIndex, targetIndex);
}

/** Collect every clip ID from all tracks (tracks array order, then clip array order). */
export function getAllClipIds(tracks) {
  return tracks.flatMap((track) => track.clips.map((clip) => clip.id));
}

/** Drop selection IDs that no longer exist in the timeline. */
export function sanitizeSelection(selectedIds, tracks) {
  const validIds = new Set(getAllClipIds(tracks));
  return selectedIds.filter((id) => validIds.has(id));
}

/**
 * Marquee prep — not wired to mouse events in Phase 1.2.
 *
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 * @param {Array<{ id: string }>} clips
 * @param {(clip: object) => { left: number, top: number, width: number, height: number }} getGeometry
 * @returns {string[]} matching clip IDs
 */
export function getClipsInSelectionRect(rect, clips, getGeometry) {
  return clips
    .filter((clip) => {
      const geometry = getGeometry(clip);
      const clipRight = geometry.left + geometry.width;
      const clipBottom = geometry.top + geometry.height;
      return (
        geometry.left < rect.right &&
        clipRight > rect.left &&
        geometry.top < rect.bottom &&
        clipBottom > rect.top
      );
    })
    .map((clip) => clip.id);
}

/**
 * Shift+click range selection on the same track only.
 * Cross-track shift selection is intentionally deferred to a later phase:
 * when anchor and target are on different tracks, returns null so the caller
 * can fall back to single selection.
 */
export function getShiftRangeSelection(tracks, anchorId, targetId) {
  const anchorTrack = tracks.find((track) => track.clips.some((clip) => clip.id === anchorId));
  const targetTrack = tracks.find((track) => track.clips.some((clip) => clip.id === targetId));
  if (!anchorTrack || !targetTrack || anchorTrack.id !== targetTrack.id) return null;

  const trackClipIds = anchorTrack.clips.map((clip) => clip.id);
  return getSelectedIdsInRange(trackClipIds, anchorId, targetId);
}
