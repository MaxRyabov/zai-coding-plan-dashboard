import type { Account } from '@/lib/accounts';

export const VAULT_STORAGE_KEY = 'zai-vault';

/** The plaintext single-key slot this feature replaces. Read once, then deleted. */
export const LEGACY_API_KEY_STORAGE_KEY = 'zai-api-key';

export const VAULT_VERSION = 1;

export interface VaultEnvelope {
  v: number;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
    ciphertext: string;
  };
  updatedAt: number;
}

export interface VaultPayload {
  v: number;
  accounts: Account[];
}

function isEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<VaultEnvelope>;
  return typeof envelope.v === 'number'
    && typeof envelope.kdf?.iterations === 'number'
    && typeof envelope.kdf?.salt === 'string'
    && typeof envelope.cipher?.iv === 'string'
    && typeof envelope.cipher?.ciphertext === 'string';
}

/** Returns null when nothing is stored or the stored value is not a vault at all. */
export function readEnvelope(): VaultEnvelope | null {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeEnvelope(envelope: VaultEnvelope): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope));
}

export function clearVault(): void {
  localStorage.removeItem(VAULT_STORAGE_KEY);
  localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
}

export function readLegacyKey(): string | null {
  return localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY);
}

export function clearLegacyKey(): void {
  localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
}

export function isValidPayload(value: unknown): value is VaultPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<VaultPayload>;
  return typeof payload.v === 'number' && Array.isArray(payload.accounts);
}
