'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QuotaCards } from '@/components/QuotaCards';
import { ToolUsageTable } from '@/components/ToolUsageTable';
import { UsageCharts } from '@/components/UsageCharts';
import { useAccountsUsage } from '@/components/AccountsUsageContext';
import { useTimezone } from '@/components/TimezoneContext';
import { useUsageErrorText } from '@/components/useUsageError';
import type { Account } from '@/lib/accounts';
import { IDLE_USAGE_RECORD } from '@/lib/usage';

export function AccountSection({ account }: { account: Account }) {
  const t = useTranslations();
  const locale = useLocale();
  const { timezone } = useTimezone();
  const { records, refreshAccount } = useAccountsUsage();
  const errorText = useUsageErrorText();

  const record = records[account.id] ?? IDLE_USAGE_RECORD;
  const isLoading = record.status === 'loading';
  const { data } = record;

  const fetchedAt = record.fetchedAt !== null && record.status === 'ok'
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone })
      .format(record.fetchedAt)
    : null;

  return (
    <section className='flex flex-col gap-4'>
      <div className='flex items-center gap-2 border-b border-border/40 pb-2'>
        <h3 className='text-sm font-medium tracking-tight'>{account.label}</h3>
        {fetchedAt && <span className='text-[10px] text-muted-foreground'>{t('refresh.lastUpdated', { time: fetchedAt })}</span>}
        {record.partial && (
          <span className='rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300'>
            {t('summary.partial')}
          </span>
        )}
        <Button
          variant='ghost'
          size='sm'
          className='ml-auto rounded-full h-7 px-2.5 text-xs gap-1.5'
          disabled={isLoading}
          onClick={() => refreshAccount(account.id)}
          title={t('common.refresh')}
        >
          {isLoading ? <Loader2 className='w-3 h-3 animate-spin' /> : <RefreshCw className='w-3 h-3' />}
          <span className='hidden sm:inline'>{t('common.refresh')}</span>
        </Button>
      </div>

      {record.status === 'error' && (
        <Card className='border-destructive/50 bg-destructive/5'>
          <CardContent className='flex items-center gap-2'>
            <AlertCircle className='w-3.5 h-3.5 text-destructive' />
            <p className='text-destructive text-xs'>{errorText(record.error)}</p>
          </CardContent>
        </Card>
      )}

      {data?.quotaLimit?.limits && data.quotaLimit.limits.length > 0 && <QuotaCards limits={data.quotaLimit.limits} />}

      {data && (
        <UsageCharts
          modelUsage={data.modelUsage}
          quotaLimits={data.quotaLimit?.limits}
        />
      )}

      {Array.isArray(data?.toolUsage) && data.toolUsage.length > 0 && <ToolUsageTable items={data.toolUsage} />}

      {record.status === 'ok' && !data?.quotaLimit?.limits?.length && !data?.modelUsage?.timeSeries?.length && (
        <Card>
          <CardContent className='text-center py-6'>
            <p className='text-muted-foreground text-xs'>{t('summary.noActivity')}</p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
