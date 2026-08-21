/**
 * WebCrypto primitives for the account vault. No React, no storage — just bytes.
 *
 * What this protects against: someone reading localStorage on a shared machine, a synced
 * browser profile, a browser backup, a screen-shared DevTools window. What it does NOT
 * protect against: script injected into this page while the vault is unlocked, or a
 * malicious browser extension. Both of those run with the derived key already in memory.
 */

/**
 * OWASP's 2023 figure for PBKDF2-HMAC-SHA256. Measured at ~250 ms here, which unlock can
 * absorb behind a spinner. The count is stored in each envelope, so raising it later leaves
 * existing vaults readable.
 */
export const PBKDF2_ITERATIONS = 600_000;

const SALT_BYTES = 16;
/** AES-GCM is only specified for 96-bit nonces; anything else weakens it. */
const IV_BYTES = 12;

export function isCryptoAvailable(): boolean {
  return typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined';
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function newSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

export function toBase64(bytes: Uint8Array): string {
  // Byte loop rather than spread: a long ciphertext would blow the argument limit of
  // String.fromCharCode(...bytes).
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    // Non-extractable: even code running on this page cannot read the key back out.
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface Ciphertext {
  iv: string;
  ciphertext: string;
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Ciphertext> {
  // A fresh IV on every single write. Reusing one with the same key breaks GCM outright.
  const iv = randomBytes(IV_BYTES);
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const buffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoded);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(buffer)) };
}

/**
 * Throws a DOMException when the key is wrong — GCM's authentication tag is the password
 * check, so no separate verifier blob is stored. A SyntaxError instead means the bytes
 * decrypted but are not the JSON we expect.
 */
export async function decryptJson<T>(key: CryptoKey, iv: string, ciphertext: string): Promise<T> {
  const buffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) as BufferSource },
    key,
    fromBase64(ciphertext) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(buffer)) as T;
}
