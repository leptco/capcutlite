/** True when the user is performing additive selection (Ctrl on Win/Linux, Cmd on macOS). */
export function isAdditiveSelectionKey(event) {
  return Boolean(event.metaKey || event.ctrlKey);
}
