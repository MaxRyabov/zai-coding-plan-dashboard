'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ToolUsageItem } from '@/lib/usage';

export function ToolUsageTable({ items }: { items: ToolUsageItem[] }) {
  const t = useTranslations();

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-medium'>{t('toolUsage.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto -mx-4'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='border-b'>
                <th className='text-left py-2 px-4 text-muted-foreground font-medium'>{t('toolUsage.tool')}</th>
                <th className='text-right py-2 px-4 text-muted-foreground font-medium'>{t('toolUsage.totalCalls')}</th>
                <th className='text-right py-2 px-4 text-muted-foreground font-medium'>{t('toolUsage.success')}</th>
                <th className='text-right py-2 px-4 text-muted-foreground font-medium'>{t('toolUsage.failures')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className='border-b last:border-0'>
                  <td className='py-2 px-4 font-medium'>{item.tool}</td>
                  <td className='py-2 px-4 text-right tabular-nums'>{item.callCount?.toLocaleString()}</td>
                  <td className='py-2 px-4 text-right tabular-nums text-green-600 dark:text-green-400'>
                    {item.successCount?.toLocaleString()}
                  </td>
                  <td className='py-2 px-4 text-right tabular-nums text-red-600 dark:text-red-400'>
                    {item.failureCount?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
