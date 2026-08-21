/** Z.AI reports usage timestamps as wall-clock strings in Beijing time. */
export const ZAI_TIMEZONE = 'Asia/Shanghai';

export const TIMEZONE_STORAGE_KEY = 'zai-timezone';

/** Sentinel for "follow the browser timezone". */
export const SYSTEM_TIMEZONE = 'system';

export const TIMEZONE_OPTIONS = [
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
];

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(date: Date, timeZone: string): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of `timeZone` from UTC, in minutes, at the given instant (DST-aware). */
export function getUtcOffsetMinutes(timeZone: string, date: Date = new Date()): number {
  const w = wallClock(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - (date.getTime() - date.getMilliseconds())) / 60000);
}

/** Human-readable offset, e.g. `UTC+3`, `UTC-3:30`, `UTC`. */
export function formatUtcOffset(timeZone: string, date: Date = new Date()): string {
  const minutes = getUtcOffsetMinutes(timeZone, date);
  if (minutes === 0) return 'UTC';
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const rest = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** `YYYY-MM-DD HH:mm:ss` wall clock in `timeZone`. */
export function formatWallClock(date: Date, timeZone: string): string {
  const w = wallClock(date, timeZone);
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
}

/** `YYYY-MM-DD` wall clock in `timeZone` — used to tell "today" from another day. */
export function formatWallClockDate(date: Date, timeZone: string): string {
  return formatWallClock(date, timeZone).slice(0, 10);
}

/**
 * Turn a `YYYY-MM-DD HH:mm[:ss]` wall-clock string in `timeZone` into epoch ms.
 * Returns null when the input does not look like a timestamp.
 */
export function parseWallClock(value: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const asUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0));

  // The offset depends on the instant we are resolving, so probe with the naive guess first.
  const guess = asUtc - getUtcOffsetMinutes(timeZone, new Date(asUtc)) * 60000;
  return asUtc - getUtcOffsetMinutes(timeZone, new Date(guess)) * 60000;
}

/**
 * An hour-aligned "last N days" window expressed in Beijing wall clock — anywhere else and
 * the window is skewed by the browser's offset.
 *
 * Compute it once per refresh and pass it to every account: recomputing per account would
 * straddle an hour boundary mid-fetch and make the aggregate row sum mismatched intervals.
 */
export function buildUsageWindow(now: Date = new Date(), days = 1): { startTime: string; endTime: string } {
  const toHourBoundary = (date: Date, suffix: string) => `${formatWallClock(date, ZAI_TIMEZONE).slice(0, 13)}:${suffix}`;
  return {
    startTime: toHourBoundary(new Date(now.getTime() - days * 24 * 60 * 60 * 1000), '00:00'),
    endTime: toHourBoundary(now, '59:59'),
  };
}
