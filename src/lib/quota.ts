import type { QuotaLimitItem } from '@/lib/usage';

// Why any of this is shaped the way it is: docs/zai-api.md

/** The shape Z.AI returns from `/api/monitor/usage/quota/limit`. */
export interface UpstreamQuotaLimitItem {
  type: string;
  percentage: number;
  currentValue?: number;
  usage?: number;
  remaining?: number;
  nextResetTime?: number;
  usageDetails?: { modelCode: string; usage: number }[];
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * A 5-hour window can never be more than five hours from resetting, so anything further out
 * is provably not the 5-hour cap. The hour of slack absorbs clock skew against Z.AI.
 *
 * Note this only rules candidates OUT. It cannot rule one in: late in a weekly cycle the
 * weekly reset falls inside this horizon too.
 */
const SHORT_WINDOW_HORIZON_MS = 6 * HOUR_MS;

/**
 * Z.AI caps tokens both per 5 hours and per 7 days, reports BOTH under the same
 * `TOKENS_LIMIT` type with identical labels, and names the period nowhere in the payload.
 *
 * Position is the signal that holds: the array arrives in the same order Z.AI's own dashboard
 * renders it — 5-hour, then weekly, then MCP. `nextResetTime` cannot carry this on its own,
 * because an idle 5-hour window comes back with no reset time at all while an exhausted
 * weekly cap can be only hours from resetting.
 *
 * So order decides, and the reset time is used only to reject a candidate that could not
 * possibly be a 5-hour window.
 */
export function normalizeQuotaLimits(
  raw: UpstreamQuotaLimitItem[] | undefined,
  now: number = Date.now(),
): QuotaLimitItem[] | undefined {
  if (!raw) return undefined;

  const tokenIndexes = raw.reduce<number[]>((acc, item, index) => {
    if (item.type === 'TOKENS_LIMIT') acc.push(index);
    return acc;
  }, []);

  const couldBeShortWindow = (index: number) => {
    const reset = raw[index].nextResetTime;
    return reset == null || reset - now <= SHORT_WINDOW_HORIZON_MS;
  };

  // The first token limit that is not provably too far out takes the 5-hour slot; if every
  // candidate looks too far out, trust the ordering anyway rather than inventing a swap.
  const shortIndex = tokenIndexes.find(couldBeShortWindow) ?? tokenIndexes[0];
  const weeklySet = new Set(tokenIndexes.filter((index) => index !== shortIndex));

  return raw.map((item, index): QuotaLimitItem => {
    if (item.type === 'TOKENS_LIMIT') {
      const isWeekly = weeklySet.has(index);
      return {
        kind: isWeekly ? 'week' : 'tokens',
        type: isWeekly ? 'Token Usage (7 Days)' : 'Token Usage (5 Hour)',
        percentage: item.percentage,
        currentUsage: item.currentValue,
        total: item.usage,
        remaining: item.remaining,
        nextResetTime: item.nextResetTime,
      };
    }

    if (item.type === 'TIME_LIMIT') {
      return {
        kind: 'mcp',
        type: 'MCP Usage (1 Month)',
        percentage: item.percentage,
        currentUsage: item.currentValue,
        total: item.usage,
        remaining: item.remaining,
        // Z.AI's own dashboard shows a reset time for this one too; the old mapping dropped it.
        nextResetTime: item.nextResetTime,
        usageDetails: item.usageDetails,
      };
    }

    // Safety net in case Z.AI ever gives the weekly cap a type of its own.
    if (/week|7\s*_?d|seven/i.test(item.type)) {
      return {
        kind: 'week',
        type: 'Token Usage (7 Days)',
        percentage: item.percentage,
        currentUsage: item.currentValue,
        total: item.usage,
        remaining: item.remaining,
        nextResetTime: item.nextResetTime,
      };
    }

    return { kind: 'other', ...item };
  });
}
