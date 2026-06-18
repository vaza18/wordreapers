/**
 * Short Ukrainian date/time for round history list rows.
 */
export function formatArchiveSavedAt(savedAt: number, locale = 'uk-UA'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(savedAt));
}
