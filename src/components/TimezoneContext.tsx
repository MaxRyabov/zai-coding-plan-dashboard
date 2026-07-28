'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SYSTEM_TIMEZONE, TIMEZONE_STORAGE_KEY } from '@/lib/timezone';

interface TimezoneContextType {
  /** Raw preference: `system` or an IANA zone id. */
  preference: string;
  /** Zone actually used for formatting. Falls back to UTC until the browser zone is known. */
  timezone: string;
  /** Browser zone, or null before mount. */
  systemTimezone: string | null;
  setPreference: (value: string) => void;
  /** False during SSR and the first client render — gate anything time-dependent on it. */
  isReady: boolean;
}

const TimezoneContext = createContext<TimezoneContextType | null>(null);

function detectSystemTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(SYSTEM_TIMEZONE);
  const [systemTimezone, setSystemTimezone] = useState<string | null>(null);

  // Resolve on the client only: the server's zone must not leak into the markup.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSystemTimezone(detectSystemTimezone());

    const saved = localStorage.getItem(TIMEZONE_STORAGE_KEY);
    if (saved) {
      setPreferenceState(saved);
    }
  }, []);

  const setPreference = useCallback((value: string) => {
    setPreferenceState(value);
    if (value === SYSTEM_TIMEZONE) {
      localStorage.removeItem(TIMEZONE_STORAGE_KEY);
    } else {
      localStorage.setItem(TIMEZONE_STORAGE_KEY, value);
    }
  }, []);

  const value = useMemo<TimezoneContextType>(() => ({
    preference,
    timezone: preference === SYSTEM_TIMEZONE ? (systemTimezone ?? 'UTC') : preference,
    systemTimezone,
    setPreference,
    isReady: systemTimezone !== null,
  }), [preference, systemTimezone, setPreference]);

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error('useTimezone must be used within a TimezoneProvider');
  }
  return context;
}
