/** Remove a normalized word from the entrance-animation set after the row animates in. */
export function removeEntranceNormalized(
  current: ReadonlySet<string>,
  normalized: string,
): ReadonlySet<string> {
  if (!current.has(normalized)) {
    return current;
  }
  const next = new Set(current);
  next.delete(normalized);
  return next;
}
