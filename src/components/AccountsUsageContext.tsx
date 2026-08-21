'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useVault } from '@/components/VaultContext';
import { buildUsageWindow } from '@/lib/timezone';
import { DEFAULT_REFRESH_MS, parseRefreshInterval, REFRESH_STORAGE_KEY } from '@/lib/refresh';
import { type AccountUsageRecord, EXTENDED_WINDOW_DAYS, IDLE_USAGE_RECORD, type UsageData, type UsageWindow } from '@/lib/usage';

interface Totals {
  tokens: number;
  calls: number;
  /** Null when no account returned data for the wider window at all. */
  extendedTokens: number | null;
  /** Accounts whose data actually landed — the rest must not be silently counted as zero. */
  counted: number;
  total: number;
}

/** Both windows come from the same instant, so the two columns line up across accounts. */
function buildWindows(): UsageWindow {
  const now = new Date();
  const primary = buildUsageWindow(now);
  const extended = buildUsageWindow(now, EXTENDED_WINDOW_DAYS);
  return {
    ...primary,
    extendedStartTime: extended.startTime,
    extendedEndTime: extended.endTime,
  };
}

interface AccountsUsageContextType {
  /** Keyed by account id, not by API key: relabelling or rotating a key keeps the row. */
  records: Record<string, AccountUsageRecord>;
  refreshAccount: (id: string) => void;
  refreshAll: () => void;
  isAnyLoading: boolean;
  lastRefreshAt: number | null;
  totals: Totals;
  /** 0 = auto-refresh off. */
  intervalMs: number;
  setIntervalMs: (value: number) => void;
  isIntervalReady: boolean;
}

const AccountsUsageContext = createContext<AccountsUsageContextType | null>(null);

export function AccountsUsageProvider({ children }: { children: ReactNode }) {
  const { accounts, status } = useVault();

  const [records, setRecords] = useState<Record<string, AccountUsageRecord>>({});
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [intervalMs, setIntervalMsState] = useState(DEFAULT_REFRESH_MS);
  const [isIntervalReady, setIsIntervalReady] = useState(false);

  // One guard for every overlap source at once: double clicks, an auto-refresh tick landing
  // on an account that is still loading, and StrictMode's double-invoked effects.
  const inFlight = useRef(new Set<string>());

  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  });

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only */
    setIntervalMsState(parseRefreshInterval(localStorage.getItem(REFRESH_STORAGE_KEY)));
    setIsIntervalReady(true);
  }, []);

  const setIntervalMs = useCallback((value: number) => {
    setIntervalMsState(value);
    localStorage.setItem(REFRESH_STORAGE_KEY, String(value));
  }, []);

  const fetchOne = useCallback(async (id: string, apiKey: string, usageWindow: UsageWindow) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);

    // Functional updates throughout: an account can be removed while its request is open.
    setRecords((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? IDLE_USAGE_RECORD), status: 'loading', error: null },
    }));

    try {
      const response = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, ...usageWindow }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'FETCH_FAILED');
      }

      const data = result as UsageData;
      const statuses = data.upstream ? Object.values(data.upstream.status) : [];
      const partial = statuses.length > 0 && statuses.some((code) => code !== 200);

      setRecords((prev) => (
        prev[id] ? { ...prev, [id]: { data, status: 'ok', error: null, partial, fetchedAt: Date.now() } } : prev
      ));
    } catch (err) {
      const code = err instanceof Error ? err.message : 'FETCH_FAILED';
      setRecords((prev) => (
        prev[id] ? { ...prev, [id]: { data: null, status: 'error', error: code, partial: false, fetchedAt: Date.now() } } : prev
      ));
    } finally {
      inFlight.current.delete(id);
    }
  }, []);

  const refreshAll = useCallback(() => {
    const current = accountsRef.current;
    if (current.length === 0) return;

    // One window for the whole sweep, so the aggregate row never sums mismatched intervals.
    const usageWindow = buildWindows();
    setLastRefreshAt(Date.now());
    current.forEach((account) => {
      void fetchOne(account.id, account.apiKey, usageWindow);
    });
  }, [fetchOne]);

  const refreshAccount = useCallback((id: string) => {
    const account = accountsRef.current.find((item) => item.id === id);
    if (!account) return;
    void fetchOne(account.id, account.apiKey, buildWindows());
  }, [fetchOne]);

  const accountIds = accounts.map((account) => account.id).join(' ');

  // Locking must drop the decrypted usage data along with the keys, and the next unlock
  // should fetch afresh rather than show whatever was on screen before.
  useEffect(() => {
    if (status === 'unlocked') return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- discard derived data on lock */
    setRecords({});
  }, [status]);

  // Seed anything that has never been fetched. Idempotent thanks to `inFlight`, so
  // StrictMode's double-invoked effect cannot produce duplicate requests.
  useEffect(() => {
    if (status !== 'unlocked') return;
    const pending = accountsRef.current.filter((account) => !records[account.id] || records[account.id].status === 'idle');
    if (pending.length === 0) return;

    const usageWindow = buildWindows();
    pending.forEach((account) => {
      void fetchOne(account.id, account.apiKey, usageWindow);
    });
  }, [accountIds, status, records, fetchOne]);

  const refreshAllRef = useRef(refreshAll);
  useEffect(() => {
    refreshAllRef.current = refreshAll;
  });

  const lastRefreshAtRef = useRef(lastRefreshAt);
  useEffect(() => {
    lastRefreshAtRef.current = lastRefreshAt;
  });

  // Auto-refresh. Reading `refreshAll` through a ref keeps the interval from being torn down
  // and re-armed on every render, which would keep resetting its phase.
  const accountCount = accounts.length;
  useEffect(() => {
    if (intervalMs <= 0 || accountCount === 0) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      refreshAllRef.current();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, accountCount]);

  // Coming back to a tab that sat hidden for an hour should not leave stale numbers on
  // screen for up to another full interval.
  useEffect(() => {
    if (intervalMs <= 0 || accountCount === 0) return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const last = lastRefreshAtRef.current;
      if (last === null || Date.now() - last >= intervalMs) refreshAllRef.current();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [intervalMs, accountCount]);

  // Read through the account list, not through `records`: a record left behind by a deleted
  // account must not keep the spinner running forever.
  const isAnyLoading = accounts.some((account) => records[account.id]?.status === 'loading');

  const totals = useMemo<Totals>(() => {
    let tokens = 0;
    let calls = 0;
    let extendedTokens = 0;
    let hasExtended = false;
    let counted = 0;

    accounts.forEach((account) => {
      const record = records[account.id];
      if (record?.status !== 'ok') return;
      tokens += record.data?.modelUsage?.totalTokens ?? 0;
      calls += record.data?.modelUsage?.totalCalls ?? 0;
      counted += 1;

      const extended = record.data?.extendedUsage;
      if (extended) {
        extendedTokens += extended.totalTokens;
        hasExtended = true;
      }
    });

    return {
      tokens,
      calls,
      extendedTokens: hasExtended ? extendedTokens : null,
      counted,
      total: accounts.length,
    };
  }, [accounts, records]);

  const value = useMemo<AccountsUsageContextType>(() => ({
    records,
    refreshAccount,
    refreshAll,
    isAnyLoading,
    lastRefreshAt,
    totals,
    intervalMs,
    setIntervalMs,
    isIntervalReady,
  }), [records, refreshAccount, refreshAll, isAnyLoading, lastRefreshAt, totals, intervalMs, setIntervalMs, isIntervalReady]);

  return <AccountsUsageContext.Provider value={value}>{children}</AccountsUsageContext.Provider>;
}

export function useAccountsUsage() {
  const context = useContext(AccountsUsageContext);
  if (!context) {
    throw new Error('useAccountsUsage must be used within an AccountsUsageProvider');
  }
  return context;
}
