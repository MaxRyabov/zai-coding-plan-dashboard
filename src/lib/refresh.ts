/** Not a secret — kept in plain localStorage so changing it does not re-encrypt the vault. */
export const REFRESH_STORAGE_KEY = 'zai-refresh-interval';

/** 0 means "off". */
export const REFRESH_OPTIONS = [0, 60_000, 300_000, 900_000] as const;

export const DEFAULT_REFRESH_MS = 300_000;

export function parseRefreshInterval(value: string | null): number {
  if (value === null) return DEFAULT_REFRESH_MS;
  const parsed = Number(value);
  return (REFRESH_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_REFRESH_MS;
}
