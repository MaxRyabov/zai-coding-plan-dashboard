'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type Account, isValidApiKey, maskKey, newAccountId } from '@/lib/accounts';
import { decryptJson, deriveKey, encryptJson, fromBase64, isCryptoAvailable, newSalt, PBKDF2_ITERATIONS, toBase64 } from '@/lib/crypto';
import {
  clearLegacyKey,
  clearVault,
  isValidPayload,
  readEnvelope,
  readLegacyKey,
  type VaultEnvelope,
  VAULT_VERSION,
  type VaultPayload,
  writeEnvelope,
} from '@/lib/vault';

export type VaultStatus = 'loading' | 'unavailable' | 'setup' | 'locked' | 'unlocked';

export type VaultError =
  | 'WRONG_PASSWORD'
  | 'VAULT_CORRUPT'
  | 'VAULT_VERSION'
  | 'SAVE_FAILED';

interface VaultContextType {
  status: VaultStatus;
  /** False during SSR and the first client render — gate anything storage-dependent on it. */
  isReady: boolean;
  /** Empty unless the vault is unlocked. */
  accounts: Account[];
  error: VaultError | null;
  /** Key derivation is in flight (~250 ms) — drive a spinner off this or unlock feels broken. */
  isBusy: boolean;
  /** A plaintext key from the old single-key build is waiting to be imported. */
  hasLegacyKey: boolean;
  createVault: (password: string) => Promise<boolean>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  resetVault: () => void;
  addAccount: (input: { label: string; apiKey: string }) => Promise<boolean>;
  updateAccount: (id: string, patch: Partial<Pick<Account, 'label' | 'apiKey'>>) => Promise<boolean>;
  removeAccount: (id: string) => Promise<boolean>;
  moveAccount: (id: string, delta: -1 | 1) => Promise<boolean>;
}

const VaultContext = createContext<VaultContextType | null>(null);

function accountFromKey(rawKey: string): Account {
  // `isValidApiKey` tolerates surrounding whitespace; what we store must not.
  const apiKey = rawKey.trim();
  // The mask doubles as a language-neutral default label; the user can rename it.
  return { id: newAccountId(), label: maskKey(apiKey), apiKey };
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<VaultError | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hasLegacyKey, setHasLegacyKey] = useState(false);

  // The derived key is deliberately not state: it never affects a render, and keeping it out
  // of state keeps it out of dependency arrays and out of the React DevTools value tree.
  const keyRef = useRef<CryptoKey | null>(null);
  const saltRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- storage and environment can only be read on the client */
    if (!isCryptoAvailable()) {
      setStatus('unavailable');
      return;
    }

    const envelope = readEnvelope();
    if (envelope) {
      setStatus('locked');
      // Refuse a newer format rather than overwriting it; offer a reset instead.
      if (envelope.v > VAULT_VERSION) setError('VAULT_VERSION');
      return;
    }

    setHasLegacyKey(isValidApiKey(readLegacyKey()));
    setStatus('setup');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /**
   * Encrypt and store first, update React second: a localStorage failure (quota, private
   * mode) must not leave the UI showing an account that was never saved.
   */
  const persist = useCallback(async (next: Account[]): Promise<boolean> => {
    const key = keyRef.current;
    const salt = saltRef.current;
    if (!key || !salt) return false;

    try {
      const payload: VaultPayload = { v: VAULT_VERSION, accounts: next };
      const cipher = await encryptJson(key, payload);
      const envelope: VaultEnvelope = {
        v: VAULT_VERSION,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
        cipher: { name: 'AES-GCM', iv: cipher.iv, ciphertext: cipher.ciphertext },
        updatedAt: Date.now(),
      };
      writeEnvelope(envelope);
    } catch {
      setError('SAVE_FAILED');
      return false;
    }

    setAccounts(next);
    setError(null);
    return true;
  }, []);

  const createVault = useCallback(async (password: string): Promise<boolean> => {
    setIsBusy(true);
    setError(null);
    try {
      const salt = newSalt();
      keyRef.current = await deriveKey(password, salt, PBKDF2_ITERATIONS);
      saltRef.current = salt;

      const legacy = readLegacyKey();
      const seeded = isValidApiKey(legacy) ? [accountFromKey(legacy)] : [];

      if (!await persist(seeded)) {
        keyRef.current = null;
        saltRef.current = null;
        return false;
      }

      // Only drop the plaintext key once its encrypted copy is on disk.
      clearLegacyKey();
      setHasLegacyKey(false);
      setStatus('unlocked');
      return true;
    } finally {
      setIsBusy(false);
    }
  }, [persist]);

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    const envelope = readEnvelope();
    if (!envelope) {
      setStatus('setup');
      return false;
    }
    if (envelope.v > VAULT_VERSION) {
      setError('VAULT_VERSION');
      return false;
    }

    setIsBusy(true);
    setError(null);
    try {
      const salt = fromBase64(envelope.kdf.salt);
      const key = await deriveKey(password, salt, envelope.kdf.iterations);

      let payload: unknown;
      try {
        payload = await decryptJson<VaultPayload>(key, envelope.cipher.iv, envelope.cipher.ciphertext);
      } catch (err) {
        // A DOMException is GCM's authentication tag rejecting the key — i.e. a wrong password.
        // Anything else means the bytes decrypted but are not the JSON we wrote.
        setError(err instanceof DOMException ? 'WRONG_PASSWORD' : 'VAULT_CORRUPT');
        return false;
      }

      if (!isValidPayload(payload)) {
        setError('VAULT_CORRUPT');
        return false;
      }

      // A vault written at a lower iteration count still opens; re-key it to the current
      // cost now, while the password is still in hand.
      keyRef.current = envelope.kdf.iterations === PBKDF2_ITERATIONS
        ? key
        : await deriveKey(password, salt, PBKDF2_ITERATIONS);
      saltRef.current = salt;

      // Belt and braces: a plaintext key should never outlive the vault that replaced it.
      const legacy = readLegacyKey();
      const next = isValidApiKey(legacy) && !payload.accounts.some((account) => account.apiKey === legacy)
        ? [...payload.accounts, accountFromKey(legacy)]
        : payload.accounts;

      if (next !== payload.accounts || envelope.kdf.iterations !== PBKDF2_ITERATIONS) {
        await persist(next);
      } else {
        setAccounts(next);
      }
      clearLegacyKey();
      setHasLegacyKey(false);

      setStatus('unlocked');
      return true;
    } finally {
      setIsBusy(false);
    }
  }, [persist]);

  const lock = useCallback(() => {
    keyRef.current = null;
    saltRef.current = null;
    setAccounts([]);
    setError(null);
    setStatus('locked');
  }, []);

  const resetVault = useCallback(() => {
    clearVault();
    keyRef.current = null;
    saltRef.current = null;
    setAccounts([]);
    setError(null);
    setHasLegacyKey(false);
    setStatus('setup');
  }, []);

  const addAccount = useCallback(async ({ label, apiKey }: { label: string; apiKey: string }) => {
    return persist([...accounts, { id: newAccountId(), label: label.trim() || maskKey(apiKey), apiKey }]);
  }, [accounts, persist]);

  const updateAccount = useCallback(async (id: string, patch: Partial<Pick<Account, 'label' | 'apiKey'>>) => {
    return persist(accounts.map((account) => (
      account.id === id
        ? {
          ...account,
          ...patch,
          label: (patch.label ?? account.label).trim() || maskKey(patch.apiKey ?? account.apiKey),
        }
        : account
    )));
  }, [accounts, persist]);

  const removeAccount = useCallback(async (id: string) => {
    return persist(accounts.filter((account) => account.id !== id));
  }, [accounts, persist]);

  const moveAccount = useCallback(async (id: string, delta: -1 | 1) => {
    const index = accounts.findIndex((account) => account.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= accounts.length) return false;

    const next = [...accounts];
    [next[index], next[target]] = [next[target], next[index]];
    return persist(next);
  }, [accounts, persist]);

  const value = useMemo<VaultContextType>(() => ({
    status,
    isReady: status !== 'loading',
    accounts,
    error,
    isBusy,
    hasLegacyKey,
    createVault,
    unlock,
    lock,
    resetVault,
    addAccount,
    updateAccount,
    removeAccount,
    moveAccount,
  }), [
    status,
    accounts,
    error,
    isBusy,
    hasLegacyKey,
    createVault,
    unlock,
    lock,
    resetVault,
    addAccount,
    updateAccount,
    removeAccount,
    moveAccount,
  ]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}
