'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActivitySummary } from '@/lib/usage';

/** The same five counters Z.AI's own dashboard shows under "Activity". */
export function ActivityStats({ activity }: { activity: ActivitySummary }) {
  const t = useTranslations();
  const locale = useLocale();

  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 });
  const minutes = Math.floor(activity.totalUsageDurationMs / 60000);

  const stats = [
    { label: t('activity.totalTokens'), value: compact.format(activity.totalTokens) },
    {
      label: activity.peakDailyTokensDate
        ? t('activity.peakTokensOn', { date: activity.peakDailyTokensDate })
        : t('activity.peakTokens'),
      value: compact.format(activity.peakDailyTokens),
    },
    { label: t('activity.duration'), value: t('activity.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 }) },
    { label: t('activity.currentStreak'), value: t('activity.days', { count: activity.currentStreakDays }) },
    { label: t('activity.longestStreak'), value: t('activity.days', { count: activity.longestStreakDays }) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-medium'>{t('activity.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className='grid gap-4' style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {stats.map((stat) => (
            <div key={stat.label} className='flex flex-col-reverse gap-0.5'>
              <dt className='text-xs text-muted-foreground'>{stat.label}</dt>
              <dd className='text-lg font-semibold tabular-nums tracking-tight'>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
