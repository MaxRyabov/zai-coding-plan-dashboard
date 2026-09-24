'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { useTimezone } from '@/components/TimezoneContext';
import { formatWallClockDate } from '@/lib/timezone';
import type { QuotaLimitItem } from '@/lib/usage';

export function quotaBarClass(percentage: number) {
  if (percentage > 80) return 'bg-red-400/80 dark:bg-red-300/70';
  if (percentage > 50) return 'bg-amber-400/80 dark:bg-amber-300/70';
  return 'bg-emerald-500/80 dark:bg-emerald-400/70';
}

/** Labels come from `kind`; Z.AI's raw `type` is only shown for a limit this app does not know. */
export function useQuotaLabel() {
  const t = useTranslations();
  return (limit: QuotaLimitItem) => {
    switch (limit.kind) {
      case 'tokens':
        return t('quota.kindTokens');
      case 'week':
        return t('quota.kindWeek');
      case 'mcp':
        return t('quota.kindMcp');
      default:
        return limit.type;
    }
  };
}

export function QuotaCards({ limits }: { limits: QuotaLimitItem[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const { timezone } = useTimezone();
  const label = useQuotaLabel();

  const formatNumber = (value: number) => Math.round(value).toLocaleString(locale);

  const formatResetTime = (timestamp: number) => {
    const date = new Date(timestamp);
    // Monthly quotas reset days from now — showing a bare clock time would be misleading.
    const isToday = formatWallClockDate(date, timezone) === formatWallClockDate(new Date(), timezone);
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
      ...(isToday ? {} : { month: 'short', day: 'numeric' }),
    };

    try {
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
    }
  };

  return (
    <div className='grid gap-4' style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      {limits.map((limit, index) => {
        const unit = limit.measure === 'credits' ? t('quota.credits') : limit.measure === 'calls' ? t('quota.calls') : null;

        return (
          <Card key={index}>
            <CardHeader>
              <CardDescription className='text-xs'>{label(limit)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='flex items-end gap-1.5 mb-2'>
                <span className='text-2xl font-semibold tabular-nums tracking-tight'>{limit.percentage}</span>
                <span className='text-muted-foreground text-xs mb-0.5'>{t('quota.used')}</span>
              </div>
              <div className='w-full bg-muted rounded-full h-1.5 overflow-hidden'>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${quotaBarClass(limit.percentage)}`}
                  style={{ width: `${Math.min(limit.percentage, 100)}%` }}
                />
              </div>
              <div className='mt-2 flex justify-between gap-2 text-xs text-muted-foreground'>
                {limit.currentUsage !== undefined && limit.total !== undefined && (
                  <span className='tabular-nums'>
                    {formatNumber(limit.currentUsage)} / {formatNumber(limit.total)}
                    {unit && ` ${unit}`}
                  </span>
                )}
                {limit.remaining !== undefined && (
                  <span className='tabular-nums'>{formatNumber(limit.remaining)} {t('quota.remaining')}</span>
                )}
              </div>
              {limit.nextResetTime && (
                <p className='mt-1.5 text-[10px] text-muted-foreground'>
                  {t('quota.resetsAt', { time: formatResetTime(limit.nextResetTime) })}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
