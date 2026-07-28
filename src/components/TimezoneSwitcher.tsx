'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTimezone } from '@/components/TimezoneContext';
import { formatUtcOffset, getUtcOffsetMinutes, SYSTEM_TIMEZONE, TIMEZONE_OPTIONS } from '@/lib/timezone';

function zoneName(timeZone: string, locale: string) {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value || timeZone;
  } catch {
    return timeZone;
  }
}

export function TimezoneSwitcher({ align = 'start' }: { align?: 'start' | 'end' } = {}) {
  const t = useTranslations();
  const locale = useLocale();
  const { preference, timezone, systemTimezone, setPreference, isReady } = useTimezone();

  // Zone names and offsets depend on "now", so keep them off the server-rendered markup.
  if (!isReady) {
    return (
      <Button variant='ghost' size='sm' className='rounded-full h-8 px-3 text-xs gap-1.5' disabled>
        <Clock className='w-3.5 h-3.5' />
      </Button>
    );
  }

  const now = new Date();
  const zones = [...new Set([...TIMEZONE_OPTIONS, systemTimezone ?? 'UTC', preference])]
    .filter((zone) => zone !== SYSTEM_TIMEZONE)
    .map((zone) => ({ zone, offset: getUtcOffsetMinutes(zone, now) }))
    .sort((a, b) => a.offset - b.offset || a.zone.localeCompare(b.zone));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='sm' className='rounded-full h-8 px-3 text-xs gap-1.5' title={t('timezone.label')}>
          <Clock className='w-3.5 h-3.5' />
          <span className='hidden sm:inline tabular-nums'>{formatUtcOffset(timezone, now)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className='min-w-[240px] max-h-[70vh] overflow-y-auto'>
        <DropdownMenuItem
          onClick={() => setPreference(SYSTEM_TIMEZONE)}
          disabled={preference === SYSTEM_TIMEZONE}
          className='text-xs gap-3'
        >
          <span className='flex-1 truncate'>
            {t('timezone.system')}
            {systemTimezone && <span className='text-muted-foreground'>{` — ${zoneName(systemTimezone, locale)}`}</span>}
          </span>
          {systemTimezone && <span className='text-muted-foreground tabular-nums'>{formatUtcOffset(systemTimezone, now)}</span>}
        </DropdownMenuItem>
        {zones.map(({ zone }) => (
          <DropdownMenuItem
            key={zone}
            onClick={() => setPreference(zone)}
            disabled={preference === zone}
            className='text-xs gap-3'
          >
            <span className='flex-1 truncate'>{zoneName(zone, locale)}</span>
            <span className='text-muted-foreground tabular-nums'>{formatUtcOffset(zone, now)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
