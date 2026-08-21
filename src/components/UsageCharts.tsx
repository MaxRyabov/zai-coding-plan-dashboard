'use client';

import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTimezone } from '@/components/TimezoneContext';
import type { ModelUsageData, QuotaLimitItem } from '@/lib/usage';

function tooltipLabel(label: unknown, payload: ReadonlyArray<{ payload?: unknown }> | undefined) {
  const point = payload?.[0]?.payload as { fullLabel?: string } | undefined;
  return point?.fullLabel ?? String(label ?? '');
}

function tooltipValue(value: unknown) {
  return typeof value === 'number' ? value.toLocaleString() : String(value ?? '0');
}

function safeFormatter(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  }
}

interface UsageChartsProps {
  modelUsage?: ModelUsageData | null;
  quotaLimits?: QuotaLimitItem[] | null;
}

export function UsageCharts({ modelUsage, quotaLimits }: UsageChartsProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { timezone } = useTimezone();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // The API reports hours in Beijing wall-clock time; re-render them in the selected zone.
  const chartData = useMemo(() => {
    const axisFormatter = safeFormatter(locale, timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const tooltipFormatter = safeFormatter(locale, timezone, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    return (modelUsage?.timeSeries ?? []).map((item) => ({
      ...item,
      label: item.timestamp != null ? axisFormatter.format(item.timestamp) : item.time,
      fullLabel: item.timestamp != null ? tooltipFormatter.format(item.timestamp) : item.fullTime,
    }));
  }, [modelUsage?.timeSeries, locale, timezone]);

  const hasModelData = modelUsage?.timeSeries && modelUsage.timeSeries.length > 0;
  const hasQuotaData = quotaLimits && quotaLimits.length > 0;

  if (!hasModelData && !hasQuotaData) {
    return null;
  }

  const isDark = mounted && resolvedTheme === 'dark';

  // Material You theme-aware colors - softer, more harmonious
  const colors = {
    grid: isDark ? 'rgba(148, 130, 180, 0.15)' : 'rgba(103, 80, 164, 0.1)',
    text: isDark ? '#a8a0b8' : '#6b6280',
    tooltipBg: isDark ? '#2d2640' : '#faf8ff',
    tooltipBorder: isDark ? 'rgba(148, 130, 180, 0.2)' : 'rgba(103, 80, 164, 0.15)',
    tooltipText: isDark ? '#e8e0f0' : '#1c1b2e',
    area: isDark ? '#b4a0d4' : '#7c5caf',
    areaGradientStart: isDark ? 'rgba(180, 160, 212, 0.35)' : 'rgba(124, 92, 175, 0.25)',
    areaGradientEnd: isDark ? 'rgba(180, 160, 212, 0.02)' : 'rgba(124, 92, 175, 0)',
    bar: isDark ? '#7eb8a8' : '#4a9080',
    pieMuted: isDark ? 'rgba(148, 130, 180, 0.2)' : 'rgba(103, 80, 164, 0.12)',
    // Cursor colors for hover state
    cursorLine: isDark ? 'rgba(180, 160, 212, 0.25)' : 'rgba(124, 92, 175, 0.2)',
    cursorFill: isDark ? 'rgba(148, 130, 180, 0.08)' : 'rgba(103, 80, 164, 0.06)',
  };

  const quotaData = quotaLimits?.map((item) => ({
    name: item.type,
    value: item.percentage,
    remaining: Math.max(0, 100 - item.percentage),
  })) || [];

  const getQuotaColor = (percentage: number) => {
    if (percentage > 80) return isDark ? '#e8a0a0' : '#c45050';
    if (percentage > 50) return isDark ? '#d4c090' : '#a08040';
    return isDark ? '#7eb8a8' : '#4a9080';
  };

  return (
    <div className='grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3'>
      {/* Token Usage Over Time */}
      {hasModelData && (
        <Card>
          <CardHeader>
            <CardTitle className='text-sm font-medium'>{t('charts.tokenUsage')}</CardTitle>
            <CardDescription className='text-xs'>
              {t('charts.totalTokens', { count: modelUsage.totalTokens.toLocaleString() })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='h-[180px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id='colorTokens' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor={colors.area} stopOpacity={isDark ? 0.4 : 0.3} />
                      <stop offset='95%' stopColor={colors.area} stopOpacity={isDark ? 0.05 : 0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray='3 3' stroke={colors.grid} />
                  <XAxis
                    dataKey='label'
                    tick={{ fontSize: 10, fill: colors.text }}
                    tickLine={false}
                    tickMargin={6}
                    minTickGap={16}
                    stroke={colors.grid}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: colors.text }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickMargin={4}
                    tickFormatter={(value) => {
                      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                      return value;
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: colors.tooltipBg,
                      border: `1px solid ${colors.tooltipBorder}`,
                      borderRadius: '6px',
                      color: colors.tooltipText,
                      fontSize: '11px',
                      padding: '6px 10px',
                    }}
                    cursor={{ stroke: colors.cursorLine, strokeWidth: 1 }}
                    formatter={(value) => [`${tooltipValue(value)} tokens`, t('charts.usage')]}
                    labelFormatter={(label, payload) => t('charts.time', { time: tooltipLabel(label, payload) })}
                    labelStyle={{ color: colors.tooltipText, fontSize: '10px' }}
                  />
                  <Area
                    type='monotone'
                    dataKey='tokens'
                    stroke={colors.area}
                    fillOpacity={1}
                    fill='url(#colorTokens)'
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Calls Over Time */}
      {hasModelData && (
        <Card>
          <CardHeader>
            <CardTitle className='text-sm font-medium'>{t('charts.apiCalls')}</CardTitle>
            <CardDescription className='text-xs'>
              {t('charts.totalCalls', { count: modelUsage.totalCalls.toLocaleString() })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='h-[180px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray='3 3' stroke={colors.grid} />
                  <XAxis
                    dataKey='label'
                    tick={{ fontSize: 10, fill: colors.text }}
                    tickLine={false}
                    tickMargin={6}
                    minTickGap={16}
                    stroke={colors.grid}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: colors.text }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickMargin={4}
                    allowDecimals={false}
                    tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: colors.tooltipBg,
                      border: `1px solid ${colors.tooltipBorder}`,
                      borderRadius: '6px',
                      color: colors.tooltipText,
                      fontSize: '11px',
                      padding: '6px 10px',
                    }}
                    cursor={{ fill: colors.cursorFill }}
                    formatter={(value) => [`${tooltipValue(value)} ${t('charts.calls')}`, t('charts.usage')]}
                    labelFormatter={(label, payload) => t('charts.time', { time: tooltipLabel(label, payload) })}
                    labelStyle={{ color: colors.tooltipText, fontSize: '10px' }}
                  />
                  <Bar
                    dataKey='calls'
                    fill={colors.bar}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quota Pie Charts */}
      {hasQuotaData && (
        <Card>
          <CardHeader>
            <CardTitle className='text-sm font-medium'>{t('charts.quotaUsage')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col gap-3'>
              {quotaData.map((item, index) => (
                <div key={index} className='flex items-center gap-3'>
                  <div className='h-[50px] w-[50px] flex-shrink-0'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <PieChart>
                        <Pie
                          data={[
                            { name: t('charts.usage'), value: item.value },
                            { name: t('charts.remaining'), value: item.remaining },
                          ]}
                          cx='50%'
                          cy='50%'
                          innerRadius={16}
                          outerRadius={24}
                          paddingAngle={2}
                          dataKey='value'
                          stroke='none'
                        >
                          <Cell fill={getQuotaColor(item.value)} />
                          <Cell fill={colors.pieMuted} />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className='flex-1 min-w-0'>
                    <p className='text-sm font-semibold tabular-nums'>{item.value}%</p>
                    <p className='text-xs text-muted-foreground truncate'>{item.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
