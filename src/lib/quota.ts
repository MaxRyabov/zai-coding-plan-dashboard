import type { QuotaBilling, QuotaLimitItem, QuotaMeasure } from '@/lib/usage';

// Why any of this is shaped the way it is: docs/zai-api.md

/** The shape Z.AI returns from `/api/monitor/usage/quota/limit`. */
export interface UpstreamQuotaLimitItem {
  type: string;
  /** Period unit code: 3 = hours, 5 = months, 6 = weeks. Absent on payloads before 2026-09. */
  unit?: number;
  /** How many `unit`s the window spans: `unit: 3, number: 5` is the 5-hour window. */
  number?: number;
  percentage: number;
  currentValue?: number;
  usage?: number;
  remaining?: number;
  nextResetTime?: number;
  usageDetails?: { modelCode: string; usage: number }[];
}

export interface UpstreamQuotaLimit {
  limits?: UpstreamQuotaLimitItem[];
  /** Plan tier: `lite`, `pro`, `max`. */
  level?: string;
}

export interface NormalizedQuota {
  limits: QuotaLimitItem[];
  billing: QuotaBilling;
  level?: string;
}

const UNIT_HOUR = 3;
const UNIT_MONTH = 5;
const UNIT_WEEK = 6;

/** Token plans cap by percentage only; credit plans cap by an absolute number of credits. */
const TOKENS_LIMIT = 'TOKENS_LIMIT';
const CREDIT_LIMIT = 'CREDIT_LIMIT';
const TIME_LIMIT = 'TIME_LIMIT';

const HOUR_MS = 60 * 60 * 1000;

/**
 * A 5-hour window can never be more than five hours from resetting, so anything further out
 * is provably not the 5-hour cap. The hour of slack absorbs clock skew against Z.AI.
 *
 * Note this only rules candidates OUT. It cannot rule one in: late in a weekly cycle the
 * weekly reset falls inside this horizon too.
 */
const SHORT_WINDOW_HORIZON_MS = 6 * HOUR_MS;

const isWindowCap = (item: UpstreamQuotaLimitItem) => item.type === TOKENS_LIMIT || item.type === CREDIT_LIMIT;

/** Reads the period straight off `unit`, which Z.AI's own dashboard keys its cards on. */
function kindFromUnit(item: UpstreamQuotaLimitItem): QuotaLimitItem['kind'] | null {
  if (item.unit === UNIT_HOUR) return isWindowCap(item) ? 'tokens' : null;
  if (item.unit === UNIT_WEEK) return isWindowCap(item) ? 'week' : null;
  if (item.unit === UNIT_MONTH) return item.type === TIME_LIMIT ? 'mcp' : null;
  return null;
}

/**
 * Payloads without `unit` name the period nowhere, and both token caps share one `type`.
 *
 * Position is the signal that holds there: the array arrives in the same order Z.AI's own
 * dashboard renders it — 5-hour, then weekly, then MCP. `nextResetTime` cannot carry this on
 * its own, because an idle 5-hour window comes back with no reset time at all while an
 * exhausted weekly cap can be only hours from resetting.
 *
 * So order decides, and the reset time is used only to reject a candidate that could not
 * possibly be a 5-hour window.
 */
function kindsFromOrder(raw: UpstreamQuotaLimitItem[], now: number): Map<number, QuotaLimitItem['kind']> {
  const capIndexes = raw.reduce<number[]>((acc, item, index) => {
    if (isWindowCap(item)) acc.push(index);
    return acc;
  }, []);

  const couldBeShortWindow = (index: number) => {
    const reset = raw[index].nextResetTime;
    return reset == null || reset - now <= SHORT_WINDOW_HORIZON_MS;
  };

  // The first cap that is not provably too far out takes the 5-hour slot; if every candidate
  // looks too far out, trust the ordering anyway rather than inventing a swap.
  const shortIndex = capIndexes.find(couldBeShortWindow) ?? capIndexes[0];

  const kinds = new Map<number, QuotaLimitItem['kind']>();
  capIndexes.forEach((index) => kinds.set(index, index === shortIndex ? 'tokens' : 'week'));
  return kinds;
}

function measureOf(item: UpstreamQuotaLimitItem): QuotaMeasure | undefined {
  if (item.type === CREDIT_LIMIT) return 'credits';
  if (item.type === TIME_LIMIT) return 'calls';
  return undefined;
}

export function normalizeQuotaLimits(
  raw: UpstreamQuotaLimitItem[] | undefined,
  now: number = Date.now(),
): QuotaLimitItem[] | undefined {
  if (!raw) return undefined;

  const fallback = raw.some((item) => isWindowCap(item) && kindFromUnit(item) === null)
    ? kindsFromOrder(raw, now)
    : new Map<number, QuotaLimitItem['kind']>();

  return raw.map((item, index): QuotaLimitItem => {
    const kind = kindFromUnit(item)
      ?? fallback.get(index)
      ?? (item.type === TIME_LIMIT ? 'mcp' : null)
      // Safety net in case Z.AI ever gives the weekly cap a type of its own.
      ?? (/week|7\s*_?d|seven/i.test(item.type) ? 'week' : 'other');

    return {
      kind,
      type: item.type,
      measure: measureOf(item),
      percentage: item.percentage,
      // Z.AI's naming is inverted: `usage` is the cap, `currentValue` the amount used.
      currentUsage: item.currentValue,
      total: item.usage,
      remaining: item.remaining,
      nextResetTime: item.nextResetTime,
      ...(item.usageDetails ? { usageDetails: item.usageDetails } : {}),
    };
  });
}

export function normalizeQuota(raw: UpstreamQuotaLimit | null | undefined, now: number = Date.now()): NormalizedQuota | null {
  const limits = normalizeQuotaLimits(raw?.limits, now);
  if (!limits) return null;

  return {
    limits,
    billing: raw?.limits?.some((item) => item.type === CREDIT_LIMIT) ? 'credits' : 'tokens',
    ...(typeof raw?.level === 'string' && raw.level ? { level: raw.level } : {}),
  };
}
