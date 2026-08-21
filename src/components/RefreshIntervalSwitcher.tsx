'use client';

import { useTranslations } from 'next-intl';
import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAccountsUsage } from '@/components/AccountsUsageContext';
import { REFRESH_OPTIONS } from '@/lib/refresh';

export function RefreshIntervalSwitcher({ align = 'start' }: { align?: 'start' | 'end' } = {}) {
  const t = useTranslations();
  const { intervalMs, setIntervalMs, isIntervalReady } = useAccountsUsage();

  // The stored preference is only known on the client; a placeholder keeps the markup stable.
  if (!isIntervalReady) {
    return (
      <Button variant='ghost' size='sm' className='rounded-full h-8 px-3 text-xs gap-1.5' disabled>
        <Timer className='w-3.5 h-3.5' />
      </Button>
    );
  }

  const optionLabel = (value: number) => (value === 0 ? t('refresh.off') : t('refresh.minutes', { count: value / 60_000 }));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='sm' className='rounded-full h-8 px-3 text-xs gap-1.5' title={t('refresh.label')}>
          <Timer className='w-3.5 h-3.5' />
          <span className='hidden sm:inline tabular-nums'>{optionLabel(intervalMs)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className='min-w-[160px]'>
        {REFRESH_OPTIONS.map((value) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setIntervalMs(value)}
            disabled={value === intervalMs}
            className='text-xs'
          >
            {optionLabel(value)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
