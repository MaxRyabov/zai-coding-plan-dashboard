export interface TimeSeriesItem {
  time: string;
  fullTime: string;
  /** Epoch ms; null when the API returned an unparseable timestamp. */
  timestamp: number | null;
  calls: number;
  tokens: number;
}

export interface ModelTokens {
  name: string;
  tokens: number;
}

export interface ModelUsageData {
  timeSeries: TimeSeriesItem[];
  totalCalls: number;
  totalTokens: number;
  /** Per-model tokens over the same window, largest first. Empty when Z.AI sent no breakdown. */
  models?: ModelTokens[];
}

export interface ToolUsageItem {
  tool: string;
  callCount: number;
  /** Only the pre-2026-09 tool-usage payload carried these. */
  successCount?: number;
  failureCount?: number;
}

/** What the absolute numbers of a limit count; absent when Z.AI reports a percentage only. */
export type QuotaMeasure = 'credits' | 'calls';

/** `credits` for plans capped by an absolute credit budget, `tokens` for the percentage-only plans. */
export type QuotaBilling = 'credits' | 'tokens';

export interface QuotaLimitItem {
  /** Stable discriminator: `tokens` is the 5-hour window, `week` the 7-day one, `mcp` the monthly call cap. */
  kind?: 'tokens' | 'week' | 'mcp' | 'other';
  /** Z.AI's own type: `TOKENS_LIMIT`, `CREDIT_LIMIT`, `TIME_LIMIT`. Not a display label. */
  type: string;
  measure?: QuotaMeasure;
  percentage: number;
  currentUsage?: number;
  total?: number;
  remaining?: number;
  nextResetTime?: number;
  usageDetails?: { modelCode: string; usage: number }[];
}

/** Per-endpoint HTTP status from Z.AI: 200, an upstream code, or null when the request never landed. */
export interface UpstreamStatus {
  modelUsage: number | null;
  toolUsage: number | null;
  quotaLimit: number | null;
  /** Only present when an extended window was asked for. */
  extendedUsage?: number | null;
  activity?: number | null;
}

/**
 * Why one endpoint failed, straight from Z.AI. Diagnostic only: `msg` arrives in whatever
 * language the gateway feels like and must never reach the UI — map `code` instead.
 */
export interface UpstreamFailure {
  /** Z.AI's business code from the envelope; null when the request never landed. */
  code: number | null;
  msg: string | null;
}

export interface UpstreamDetail {
  status: UpstreamStatus;
  /** Keyed by endpoint name; only endpoints that did not answer 200 appear. */
  failures?: Record<string, UpstreamFailure>;
}

/** Totals only — the extended window is a headline number, not a chart. */
export interface ExtendedUsageData {
  totalCalls: number;
  totalTokens: number;
}

/** Lifetime-style counters from `credit-usage/activity`, over the last 365 Beijing calendar days. */
export interface ActivitySummary {
  totalTokens: number;
  peakDailyTokens: number;
  /** `YYYY-MM-DD`, Beijing calendar day; null when there was no usage at all. */
  peakDailyTokensDate: string | null;
  totalUsageDurationMs: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

export interface UsageData {
  modelUsage?: ModelUsageData | null;
  toolUsage?: ToolUsageItem[] | null;
  quotaLimit?: { limits: QuotaLimitItem[]; billing?: QuotaBilling; level?: string } | null;
  extendedUsage?: ExtendedUsageData | null;
  activity?: ActivitySummary | null;
  upstream?: UpstreamDetail;
}

/** How far back the second, wider column looks. */
export const EXTENDED_WINDOW_DAYS = 7;

/**
 * The windows every account is measured over. All bounds are Beijing wall clock.
 * The extended pair is optional so the route stays usable without it.
 */
export interface UsageWindow {
  startTime: string;
  endTime: string;
  extendedStartTime?: string;
  extendedEndTime?: string;
}

export type AccountUsageStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface AccountUsageRecord {
  data: UsageData | null;
  status: AccountUsageStatus;
  /** Error code, not a message — the UI maps it to a translation. */
  error: string | null;
  /** True when some Z.AI endpoints answered and others did not. */
  partial: boolean;
  fetchedAt: number | null;
}

export const IDLE_USAGE_RECORD: AccountUsageRecord = {
  data: null,
  status: 'idle',
  error: null,
  partial: false,
  fetchedAt: null,
};
