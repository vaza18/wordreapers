const ARCHIVE_DATE_TIME: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

const ARCHIVE_DATE_ONLY: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
};

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Short Ukrainian date/time for round history list rows.
 */
export function formatArchiveSavedAt(savedAt: number, locale = 'uk-UA'): string {
  return new Intl.DateTimeFormat(locale, ARCHIVE_DATE_TIME).format(new Date(savedAt));
}

/**
 * Date range for a multi-round room aggregate card.
 * Same day: "24 черв, 14:30 – 18:45". Different days: "24 – 26 черв".
 */
export function formatArchiveDateRange(
  oldestSavedAt: number,
  newestSavedAt: number,
  locale = 'uk-UA',
): string {
  if (oldestSavedAt === newestSavedAt) {
    return formatArchiveSavedAt(newestSavedAt, locale);
  }

  const oldest = new Date(oldestSavedAt);
  const newest = new Date(newestSavedAt);

  if (isSameCalendarDay(oldest, newest)) {
    const datePart = new Intl.DateTimeFormat(locale, ARCHIVE_DATE_ONLY).format(newest);
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart}, ${timeFormatter.format(oldest)} – ${timeFormatter.format(newest)}`;
  }

  const dayFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' });
  const oldestDay = dayFormatter.format(oldest);
  const newestDay = dayFormatter.format(newest);
  const month = monthFormatter.format(newest);
  return `${oldestDay} – ${newestDay} ${month}`;
}

const ROOM_HISTORY_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
};

function formatRoomHistoryDateTime(savedAt: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, ROOM_HISTORY_DATE).format(new Date(savedAt));
}

function formatRoomHistoryTime(savedAt: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(savedAt));
}

/**
 * Date/time range for the fixed room history stats band.
 * Same day: "26 червня 14:55 - 16:32". Different days: full date/time on both ends.
 */
export function formatRoomHistoryDateRange(
  oldestSavedAt: number,
  newestSavedAt: number,
  locale = 'uk-UA',
): string {
  if (oldestSavedAt === newestSavedAt) {
    return formatRoomHistoryDateTime(newestSavedAt, locale);
  }

  const oldest = new Date(oldestSavedAt);
  const newest = new Date(newestSavedAt);

  if (isSameCalendarDay(oldest, newest)) {
    const datePart = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
    }).format(newest);
    return `${datePart} ${formatRoomHistoryTime(oldestSavedAt, locale)} - ${formatRoomHistoryTime(newestSavedAt, locale)}`;
  }

  return `${formatRoomHistoryDateTime(oldestSavedAt, locale)} - ${formatRoomHistoryDateTime(newestSavedAt, locale)}`;
}
