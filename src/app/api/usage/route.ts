// Z.AI's monitoring endpoints are undocumented; what we know about them, including the
// non-obvious failure modes handled below, is written up in docs/zai-api.md.
import { NextRequest, NextResponse } from 'next/server';
import { parseWallClock, ZAI_TIMEZONE } from '@/lib/timezone';
import type { TimeSeriesItem, UpstreamDetail, UpstreamFailure } from '@/lib/usage';
import { normalizeQuotaLimits, type UpstreamQuotaLimitItem } from '@/lib/quota';

const ZAI_BASE_URL = 'https://api.z.ai';

/** Z.AI returns the time series column-wise: one parallel array per metric. */
interface UpstreamModelUsage {
  x_time?: string[];
  modelCallCount?: number[];
  tokensUsage?: number[];
  totalUsage?: { totalModelCallCount?: number; totalTokensUsage?: number };
}

interface UpstreamQuotaLimit {
  limits?: UpstreamQuotaLimitItem[];
}

/** Carries the upstream HTTP status so a dead key can be told apart from an idle one. */
class UpstreamError extends Error {
  constructor(readonly status: number, readonly failure: UpstreamFailure) {
    super(`HTTP_${status}`);
  }
}

/**
 * Z.AI signals failure with HTTP 200 and a business code in the envelope. These are the codes
 * seen on the wire; see docs/zai-api.md. Anything unlisted stays a 502 on purpose — a code we
 * have never met must surface as unknown rather than be guessed into "dead key".
 */
const ZAI_CODE_TO_STATUS: Record<number, number> = {
  401: 401, // "token expired or incorrect" — a token the gateway could not even parse
  403: 403,
  429: 429,
  1000: 401, // "Authentication Failed" — well-formed key, refused
  1001: 401, // no Authorization header reached the gateway
};

interface ZaiEnvelope {
  code?: number;
  msg?: string;
  success?: boolean;
  data?: unknown;
}

/**
 * Only an explicit `success: false` counts as a failure — a successful payload that happens
 * to omit the field must keep flowing through untouched.
 */
function readFailure(payload: unknown): { status: number; failure: UpstreamFailure } | null {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as ZaiEnvelope;
  if (envelope.success !== false) return null;

  const code = typeof envelope.code === 'number' ? envelope.code : null;
  const msg = typeof envelope.msg === 'string' ? envelope.msg : null;
  return {
    status: (code !== null ? ZAI_CODE_TO_STATUS[code] : undefined) ?? 502,
    failure: { code, msg },
  };
}

async function fetchUsage(url: string, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept-Language': 'en-US,en',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new UpstreamError(response.status, { code: null, msg: `HTTP ${response.status}` });
  }

  const data: ZaiEnvelope = await response.json();

  const failed = readFailure(data);
  if (failed !== null) {
    throw new UpstreamError(failed.status, failed.failure);
  }

  return data.data || data;
}

interface Settled {
  data: unknown;
  /** 200 on success, the mapped upstream code on failure, null when the request never landed. */
  status: number | null;
  /** Z.AI's own code and message — the only thing that makes an outage diagnosable afterwards. */
  failure: UpstreamFailure;
}

const NO_FAILURE: UpstreamFailure = { code: null, msg: null };

async function settle(promise: Promise<unknown>): Promise<Settled> {
  try {
    return { data: await promise, status: 200, failure: NO_FAILURE };
  } catch (error) {
    if (error instanceof UpstreamError) {
      return { data: null, status: error.status, failure: error.failure };
    }
    // The request never landed: DNS, TLS, timeout. Keep the reason — it is not Z.AI's verdict.
    return {
      data: null,
      status: null,
      failure: { code: null, msg: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Collapses a total failure into the one thing the user can act on. "Z.AI is unreachable",
 * "this key is dead" and "Z.AI answered code N" are three different problems with three
 * different fixes, and flattening all of them to 502 is what made the last outage unreadable.
 */
function classifyTotalFailure(settled: Settled[]): { error: string; status: number } {
  if (settled.every((item) => item.status === null)) {
    return { error: 'UPSTREAM_UNREACHABLE', status: 502 };
  }

  const statuses = new Set(settled.map((item) => item.status));
  const shared = statuses.size === 1 ? settled[0].status : null;
  if (shared !== null && [401, 403, 429].includes(shared)) {
    return { error: `HTTP_${shared}`, status: shared };
  }

  // One unmapped business code across the board: pass the code itself to the UI instead of
  // hiding it behind a generic 502.
  const codes = new Set(settled.map((item) => item.failure.code).filter((code): code is number => code !== null));
  if (codes.size === 1) {
    return { error: `ZAI_CODE_${[...codes][0]}`, status: 502 };
  }

  return { error: 'HTTP_502', status: 502 };
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, startTime, endTime, extendedStartTime, extendedEndTime } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    const range = (from?: string, to?: string) => (from && to ? `?startTime=${encodeURIComponent(from)}&endTime=${encodeURIComponent(to)}` : '');

    const queryParams = range(startTime, endTime);
    // A second model-usage call over a wider window. Only its totals are used, so the extra
    // hourly buckets it returns are discarded.
    const wantsExtended = Boolean(extendedStartTime && extendedEndTime);
    const extendedParams = range(extendedStartTime, extendedEndTime);

    const [modelUsage, toolUsage, quotaLimit, extendedUsage] = await Promise.all([
      settle(fetchUsage(`${ZAI_BASE_URL}/api/monitor/usage/model-usage${queryParams}`, apiKey)),
      settle(fetchUsage(`${ZAI_BASE_URL}/api/monitor/usage/tool-usage${queryParams}`, apiKey)),
      settle(fetchUsage(`${ZAI_BASE_URL}/api/monitor/usage/quota/limit`, apiKey)),
      wantsExtended
        ? settle(fetchUsage(`${ZAI_BASE_URL}/api/monitor/usage/model-usage${extendedParams}`, apiKey))
        : Promise.resolve<Settled>({ data: null, status: null, failure: NO_FAILURE }),
    ]);

    const byEndpoint: Record<string, Settled> = {
      modelUsage,
      toolUsage,
      quotaLimit,
      ...(wantsExtended ? { extendedUsage } : {}),
    };

    // Log every failure with Z.AI's own code and message. The UI can only ever show a mapped
    // status; without this line an outage leaves nothing behind to diagnose it from.
    const failures: Record<string, UpstreamFailure> = {};
    for (const [endpoint, item] of Object.entries(byEndpoint)) {
      if (item.status === 200) continue;
      failures[endpoint] = item.failure;
      console.warn(
        `Z.AI ${endpoint} failed: status=${item.status ?? 'unreachable'}`
        + ` code=${item.failure.code ?? '-'} msg=${item.failure.msg ?? '-'}`,
      );
    }

    const upstream: UpstreamDetail = {
      status: {
        modelUsage: modelUsage.status,
        toolUsage: toolUsage.status,
        quotaLimit: quotaLimit.status,
        ...(wantsExtended ? { extendedUsage: extendedUsage.status } : {}),
      },
      ...(Object.keys(failures).length > 0 ? { failures } : {}),
    };

    // Every endpoint rejected the key the same way — that is a verdict about the key itself,
    // not an absence of activity, so it must not look like a successful empty response.
    const settled = [modelUsage, toolUsage, quotaLimit];
    if (settled.every((item) => item.status !== 200)) {
      const { error, status } = classifyTotalFailure(settled);
      return NextResponse.json({ error, upstream }, { status });
    }

    // Process quota limit data
    const quota = quotaLimit.data as UpstreamQuotaLimit | null;
    const processedQuotaLimit = normalizeQuotaLimits(quota?.limits);

    // Transform model usage time series data for charts.
    // x_time is a Beijing wall-clock string; resolve it to an instant so the client can
    // render it in whichever timezone the user picked.
    const model = modelUsage.data as UpstreamModelUsage | null;
    const modelUsageTimeSeries: TimeSeriesItem[] = model?.x_time?.map((time: string, index: number) => ({
      time: time.split(' ')[1] || time, // Extract just the hour
      fullTime: time,
      timestamp: parseWallClock(time, ZAI_TIMEZONE),
      calls: model.modelCallCount?.[index] || 0,
      tokens: model.tokensUsage?.[index] || 0,
    })).filter((item: TimeSeriesItem) => item.calls > 0 || item.tokens > 0) || [];

    const extendedModel = extendedUsage.data as UpstreamModelUsage | null;

    const result = {
      modelUsage: {
        timeSeries: modelUsageTimeSeries,
        totalCalls: model?.totalUsage?.totalModelCallCount || 0,
        totalTokens: model?.totalUsage?.totalTokensUsage || 0,
      },
      toolUsage: toolUsage.data,
      quotaLimit: processedQuotaLimit ? { limits: processedQuotaLimit } : quotaLimit.data,
      // null rather than zeroes when the wider window was not asked for or did not answer —
      // the UI must be able to tell "no data" from "no usage".
      extendedUsage: extendedUsage.status === 200
        ? {
          totalCalls: extendedModel?.totalUsage?.totalModelCallCount || 0,
          totalTokens: extendedModel?.totalUsage?.totalTokensUsage || 0,
        }
        : null,
      upstream,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch usage data' },
      { status: 500 },
    );
  }
}
