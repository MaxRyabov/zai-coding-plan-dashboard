'use client';

import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { quotaBarClass } from '@/components/QuotaCards';
import { useAccountsUsage } from '@/components/AccountsUsageContext';
import { useVault } from '@/components/VaultContext';
import { useUsageErrorText } from '@/components/useUsageError';
import { IDLE_USAGE_RECORD, type QuotaLimitItem } from '@/lib/usage';

function QuotaCell({ limit }: { limit: QuotaLimitItem | undefined }) {
  if (!limit) return <span className='text-muted-foreground/50'>—</span>;

  return (
    <div className='flex items-center gap-1.5'>
      <div className='w-14 bg-muted rounded-full h-1.5 overflow-hidden'>
        <div
          className={`h-full rounded-full ${quotaBarClass(limit.percentage)}`}
          style={{ width: `${Math.min(limit.percentage, 100)}%` }}
        />
      </div>
      <span className='tabular-nums text-[11px]'>{limit.percentage}%</span>
    </div>
  );
}

export function AccountSummaryTable({ onManage, isManaging }: { onManage: () => void; isManaging: boolean }) {
  const t = useTranslations();
  const { accounts } = useVault();
  const { records, totals, refreshAll, isAnyLoading } = useAccountsUsage();
  const errorText = useUsageErrorText();

  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between gap-2'>
        <CardTitle className='text-sm font-medium'>{t('summary.title')}</CardTitle>
        <div className='flex items-center gap-1'>
          <Button
            variant='ghost'
            size='sm'
            className='rounded-full h-8 px-3 text-xs gap-1.5'
            onClick={onManage}
            aria-expanded={isManaging}
          >
            <Settings2 className='w-3.5 h-3.5' />
            <span className='hidden sm:inline'>{t('accounts.manage')}</span>
          </Button>
          <Button
            size='sm'
            className='rounded-full h-8 px-3 text-xs gap-1.5'
            disabled={isAnyLoading || accounts.length === 0}
            onClick={refreshAll}
          >
            {isAnyLoading ? <Loader2 className='w-3 h-3 animate-spin' /> : <RefreshCw className='w-3 h-3' />}
            <span className='hidden sm:inline'>{t('common.refreshAll')}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto -mx-4'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='border-b'>
                <th className='text-left py-2 px-4 text-muted-foreground font-medium'>{t('summary.account')}</th>
                <th className='text-left py-2 px-4 text-muted-foreground font-medium'>{t('summary.tokenQuota')}</th>
                <th className='text-left py-2 px-4 text-muted-foreground font-medium'>{t('summary.weekQuota')}</th>
                <th className='text-left py-2 px-4 text-muted-foreground font-medium'>{t('summary.mcpQuota')}</th>
                <th className='text-right py-2 px-4 text-muted-foreground font-medium'>{t('summary.tokens')}</th>
                <th className='text-right py-2 px-4 text-muted-foreground font-medium'>{t('summary.tokens7d')}</th>
                <th className='text-right py-2 px-4 text-muted-foreground font-medium'>{t('summary.calls')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const record = records[account.id] ?? IDLE_USAGE_RECORD;
                const limits = record.data?.quotaLimit?.limits ?? [];
                // Z.AI's name for the weekly cap is undocumented, so accept whatever limit is
                // left over once the 5-hour and monthly ones are accounted for.
                const weekLimit = limits.find((limit) => limit.kind === 'week')
                  ?? limits.find((limit) => limit.kind === 'other');

                return (
                  <tr key={account.id} className='border-b'>
                    <td className='py-2 px-4 font-medium max-w-[14rem] truncate'>{account.label}</td>

                    {record.status === 'error'
                      ? (
                        <td className='py-2 px-4 text-destructive' colSpan={6}>
                          {errorText(record.error)}
                        </td>
                      )
                      : record.status !== 'ok'
                      ? (
                        <td className='py-2 px-4 text-muted-foreground' colSpan={6}>
                          {record.status === 'loading'
                            ? <Loader2 className='w-3 h-3 animate-spin inline' />
                            : t('summary.never')}
                        </td>
                      )
                      : (
                        <>
                          <td className='py-2 px-4'>
                            <QuotaCell limit={limits.find((limit) => limit.kind === 'tokens')} />
                          </td>
                          <td className='py-2 px-4'>
                            <QuotaCell limit={weekLimit} />
                          </td>
                          <td className='py-2 px-4'>
                            <QuotaCell limit={limits.find((limit) => limit.kind === 'mcp')} />
                          </td>
                          <td className='py-2 px-4 text-right tabular-nums'>
                            {(record.data?.modelUsage?.totalTokens ?? 0).toLocaleString()}
                          </td>
                          <td className='py-2 px-4 text-right tabular-nums'>
                            {record.data?.extendedUsage
                              ? record.data.extendedUsage.totalTokens.toLocaleString()
                              : <span className='text-muted-foreground/50'>—</span>}
                          </td>
                          <td className='py-2 px-4 text-right tabular-nums'>
                            {(record.data?.modelUsage?.totalCalls ?? 0).toLocaleString()}
                          </td>
                        </>
                      )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className='font-medium'>
                <td className='py-2 px-4'>
                  {t('summary.total')}
                  {totals.counted < totals.total && (
                    <span className='ml-1.5 font-normal text-[10px] text-muted-foreground'>
                      {t('summary.countedFrom', { counted: totals.counted, total: totals.total })}
                    </span>
                  )}
                </td>
                {/* Quotas are per-account limits — summing them would be meaningless. */}
                <td className='py-2 px-4 text-muted-foreground/50'>—</td>
                <td className='py-2 px-4 text-muted-foreground/50'>—</td>
                <td className='py-2 px-4 text-muted-foreground/50'>—</td>
                <td className='py-2 px-4 text-right tabular-nums'>{totals.tokens.toLocaleString()}</td>
                <td className='py-2 px-4 text-right tabular-nums'>
                  {totals.extendedTokens === null
                    ? <span className='font-normal text-muted-foreground/50'>—</span>
                    : totals.extendedTokens.toLocaleString()}
                </td>
                <td className='py-2 px-4 text-right tabular-nums'>{totals.calls.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
