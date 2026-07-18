// Computes the next highlighted suggestion index for an Outlook/Teams-style
// people picker dropdown: arrow keys move the highlight and wrap around at
// both ends instead of stopping dead at the first/last item.
export function nextHighlightedIndex(
  current: number,
  length: number,
  direction: 'up' | 'down',
): number {
  if (length <= 1) return 0;
  if (direction === 'down') return (current + 1) % length;
  return (current - 1 + length) % length;
}
