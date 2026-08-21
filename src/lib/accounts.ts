export const API_KEY_PATTERN = /^[a-f0-9]{32}\.[A-Za-z0-9]{16}$/;

export interface Account {
  id: string;
  label: string;
  apiKey: string;
}

export function isValidApiKey(value: unknown): value is string {
  return typeof value === 'string' && API_KEY_PATTERN.test(value.trim());
}

export function newAccountId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older browsers still need an id; uniqueness within one vault is all that matters.
  return `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `a1b2…wxyz` — enough to tell two keys apart without showing either. */
export function maskKey(apiKey: string): string {
  if (apiKey.length <= 8) return '•'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
