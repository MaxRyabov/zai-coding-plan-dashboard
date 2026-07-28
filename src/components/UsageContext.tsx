'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { formatWallClock, ZAI_TIMEZONE } from '@/lib/timezone';

export interface UsageData {
  modelUsage?: {
    timeSeries: Array<{
      time: string;
      fullTime: string;
      /** Epoch ms; null when the API returned an unparseable timestamp. */
      timestamp: number | null;
      calls: number;
      tokens: number;
    }>;
    totalCalls: number;
    totalTokens: number;
  } | null;
  toolUsage?:
    | Array<{
      tool: string;
      callCount: number;
      successCount: number;
      failureCount: number;
    }>
    | null;
  quotaLimit?: {
    limits: Array<{
      type: string;
      percentage: number;
      currentUsage?: number;
      total?: number;
      remaining?: number;
      nextResetTime?: number;
    }>;
  } | null;
  error?: string;
}

interface UsageContextType {
  apiKey: string;
  setApiKey: (key: string) => void;
  usageData: UsageData | null;
  setUsageData: (data: UsageData | null) => void;
  isValidApiKey: boolean;
  fetchUsage: (key?: string) => void;
  isLoading: boolean;
}

const API_KEY_PATTERN = /^[a-f0-9]{32}\.[A-Za-z0-9]{16}$/;
const API_KEY_STORAGE_KEY = 'zai-api-key';

const UsageContext = createContext<UsageContextType | null>(null);

export function UsageProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState('');
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initialFetchTriggered, setInitialFetchTriggered] = useState(false);

  // Keep ref in sync with apiKey for stale closure workaround
  const apiKeyRef = useRef(apiKey);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  const isValidApiKey = API_KEY_PATTERN.test(apiKey);

  const fetchUsage = useCallback(async (key?: string) => {
    const targetApiKey = key ?? apiKeyRef.current;
    if (typeof targetApiKey !== 'string' || !targetApiKey.trim() || !API_KEY_PATTERN.test(targetApiKey)) return;

    setIsLoading(true);

    try {
      // Z.AI reads the window as Beijing wall-clock time, so build it in that zone —
      // otherwise "last 24 hours" is skewed by the browser's offset.
      const now = new Date();
      const toHourBoundary = (date: Date, suffix: string) => `${formatWallClock(date, ZAI_TIMEZONE).slice(0, 13)}:${suffix}`;

      const response = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: targetApiKey,
          startTime: toHourBoundary(new Date(now.getTime() - 24 * 60 * 60 * 1000), '00:00'),
          endTime: toHourBoundary(now, '59:59'),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'FETCH_FAILED');
      }

      setUsageData(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'FETCH_FAILED';
      setUsageData({ error: errorMsg });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restore from localStorage on mount (client-side only)
  useEffect(() => {
    const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (savedKey) {
      setApiKey(savedKey);
      // Trigger initial fetch after setting the key
      setInitialFetchTriggered(true);
    }
  }, []);

  // Save API key to localStorage when it changes
  useEffect(() => {
    if (apiKey && API_KEY_PATTERN.test(apiKey)) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    } else if (apiKey === '') {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  }, [apiKey]);

  // Auto-fetch when API key becomes available (only once, unless explicitly refetched)
  useEffect(() => {
    if (isValidApiKey && !usageData && !isLoading && initialFetchTriggered) {
      fetchUsage();
    }
  }, [isValidApiKey, usageData, isLoading, initialFetchTriggered, fetchUsage]);

  return (
    <UsageContext.Provider
      value={{
        apiKey,
        setApiKey,
        usageData,
        setUsageData,
        isValidApiKey,
        fetchUsage,
        isLoading,
      }}
    >
      {children}
    </UsageContext.Provider>
  );
}

export function useUsage() {
  const context = useContext(UsageContext);
  if (!context) {
    throw new Error('useUsage must be used within a UsageProvider');
  }
  return context;
}
