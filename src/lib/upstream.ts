import { parseWallClock, ZAI_TIMEZONE } from '@/lib/timezone';
import type { ActivitySummary, ModelTokens, ModelUsageData, TimeSeriesItem, ToolUsageItem } from '@/lib/usage';

// Pure translations from Z.AI's payloads to this app's shapes. Field-level notes and the
// evidence behind them: docs/zai-api.md

/** Z.AI returns the time series column-wise: one parallel array per metric. */
export interface UpstreamModelUsage {
  x_time?: string[];
  modelCallCount?: number[];
  tokensUsage?: number[];
  totalUsage?: { totalModelCallCount?: number; totalTokensUsage?: number };
  modelDataList?: { modelName?: string; modelCode?: string; tokensUsage?: number[]; totalTokens?: number }[];
}

/** Hourly series per tool, the shape since 2026-09. */
export interface UpstreamToolUsage {
  toolSummaryList?: { toolCode?: string; toolName?: string; toolNameI18n?: string; totalUsageCount?: number }[];
  totalUsage?: { toolSummaryList?: UpstreamToolUsage['toolSummaryList'] };
}

/** The shape before 2026-09: one row per tool. */
interface LegacyToolUsageRow {
  tool?: string;
  callCount?: number;
  successCount?: number;
  failureCount?: number;
}

export interface UpstreamActivity {
  summary?: Partial<Record<keyof ActivitySummary, unknown>>;
}

const sum = (values: readonly unknown[] | undefined) =>
  (values ?? []).reduce<number>((acc, value) => acc + (Number(value) || 0), 0);

/**
 * Per-model totals are summed from each model's own series. The `totalTokens` field next to it
 * is not bounded by the requested hours: on a window starting mid-day it came back larger than
 * the series and larger than the grand total.
 */
function modelBreakdown(list: UpstreamModelUsage['modelDataList']): ModelTokens[] {
  return (list ?? [])
    .map((model) => ({ name: model.modelName || model.modelCode || '?', tokens: sum(model.tokensUsage) }))
    .filter((model) => model.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

export function normalizeModelUsage(model: UpstreamModelUsage | null | undefined): ModelUsageData {
  // x_time is a Beijing wall-clock string (`YYYY-MM-DD HH:mm`, seconds dropped in 2026-09);
  // resolve it to an instant so the client can render it in whichever timezone the user picked.
  const timeSeries: TimeSeriesItem[] = (model?.x_time ?? []).map((time, index) => ({
    time: time.split(' ')[1] || time,
    fullTime: time,
    timestamp: parseWallClock(time, ZAI_TIMEZONE),
    calls: model?.modelCallCount?.[index] || 0,
    tokens: model?.tokensUsage?.[index] || 0,
  })).filter((item) => item.calls > 0 || item.tokens > 0);

  return {
    timeSeries,
    totalCalls: model?.totalUsage?.totalModelCallCount || 0,
    totalTokens: model?.totalUsage?.totalTokensUsage || 0,
    models: modelBreakdown(model?.modelDataList),
  };
}

/** Accepts both the legacy row array and the columnar object; anything else yields null. */
export function normalizeToolUsage(raw: unknown): ToolUsageItem[] | null {
  if (Array.isArray(raw)) {
    return (raw as LegacyToolUsageRow[]).map((row) => ({
      tool: row.tool ?? '?',
      callCount: row.callCount ?? 0,
      successCount: row.successCount,
      failureCount: row.failureCount,
    }));
  }

  if (!raw || typeof raw !== 'object') return null;
  const usage = raw as UpstreamToolUsage;
  const list = usage.toolSummaryList ?? usage.totalUsage?.toolSummaryList;
  if (!Array.isArray(list)) return null;

  // `toolName` is Chinese regardless of Accept-Language; the English name lives in `toolNameI18n`.
  return list
    .map((tool) => ({
      tool: tool.toolNameI18n || tool.toolCode || tool.toolName || '?',
      callCount: Number(tool.totalUsageCount) || 0,
    }))
    .filter((tool) => tool.callCount > 0);
}

export function normalizeActivity(raw: UpstreamActivity | null | undefined): ActivitySummary | null {
  const summary = raw?.summary;
  if (!summary || typeof summary !== 'object') return null;

  const count = (value: unknown) => Number(value) || 0;
  return {
    totalTokens: count(summary.totalTokens),
    peakDailyTokens: count(summary.peakDailyTokens),
    peakDailyTokensDate: typeof summary.peakDailyTokensDate === 'string' && summary.peakDailyTokensDate
      ? summary.peakDailyTokensDate
      : null,
    totalUsageDurationMs: count(summary.totalUsageDurationMs),
    currentStreakDays: count(summary.currentStreakDays),
    longestStreakDays: count(summary.longestStreakDays),
  };
}
