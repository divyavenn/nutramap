/** Plural form of a unit label ("box" → "boxes", "berry" → "berries"); unchanged when count is exactly 1. */
export function pluralize(label: string, count: number): string {
  if (count === 1 || !label) return label;
  // "cup of rice" → "cups of rice": pluralize the head noun
  const ofIdx = label.indexOf(' of ');
  if (ofIdx > 0) return pluralize(label.slice(0, ofIdx), count) + label.slice(ofIdx);

  const lower = label.toLowerCase();
  if (/(ss|x|z|ch|sh)$/.test(lower)) return `${label}es`;
  // Ends in a lone "s": already plural ("servings", "cups")
  if (lower.endsWith('s')) return label;
  if (/[^aeiou]y$/.test(lower)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}
