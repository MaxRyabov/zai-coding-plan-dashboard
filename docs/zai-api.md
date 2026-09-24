# Z.AI monitoring API — field notes

Everything this dashboard knows about `api.z.ai`'s usage endpoints. They are **undocumented**:
none of this comes from an official API reference. Read the provenance marks before trusting
a line of it.

| Mark | Meaning |
| --- | --- |
| **[observed]** | Seen in a real response or reproduced against the live API. |
| **[inferred]** | Deduced from rendered output or from how the original code behaved. Consistent with everything seen so far, but not read off the wire. |
| **[external]** | From Z.AI's public pages or third-party write-ups, not from the API. |
| **[unknown]** | Genuinely not established. Do not guess — measure. |

Last verified 2026-09-15 against three GLM Coding Plan accounts — two on the older token-based
plan, one on the newer credit-based plan; the business codes below were re-checked on 2026-08-21
without a key.

Endpoint paths for the `credit-usage/*` family were read out of Z.AI's own dashboard bundle
(`static.bigmodel.cn/z-ai-website/_next/static/chunks/9851-*.js`) and then called with real keys.

### What changed in 2026-09

| Endpoint | Before | Since |
| --- | --- | --- |
| `quota/limit` | Two identical `TOKENS_LIMIT` entries, period named nowhere | Every entry carries `unit` + `number`; credit plans answer `CREDIT_LIMIT` with absolute credits and no MCP entry; `level` added |
| `model-usage` | `x_time` as `YYYY-MM-DD HH:mm:ss` | `YYYY-MM-DD HH:mm`; per-model `modelDataList` added |
| `tool-usage` | Row array `[{ tool, callCount, successCount, failureCount }]` | Columnar object, success/failure counts gone |
| `credit-usage/activity` | — | New; answers both plan types |

---

## Basics

- Base URL: `https://api.z.ai` **[observed]**
- API key format: `^[a-f0-9]{32}\.[A-Za-z0-9]{16}$` — 32 lowercase hex, a dot, 16 alphanumerics **[observed]**
- Headers sent on every call **[observed]**:
  ```
  Authorization: Bearer <key>
  Accept-Language: en-US,en
  Content-Type: application/json
  ```
- All endpoints are `GET`. **[observed]**

### `Accept-Language` is not reliably honoured

`quota/limit` answered an auth failure in English (`"Authentication Failed"`) while
`tool-usage` answered the same failure in Chinese (`"身份验证失败。"`) in the same request
batch. **[observed]** Never surface `msg` to the user; map codes instead.

---

## Response envelope — and the trap

Every endpoint wraps its payload:

```json
{ "code": 200, "msg": "Operation successful", "success": true, "data": { ... } }
```

**A bad API key returns HTTP 200, not 401.** **[observed]**

```json
{ "code": 1000, "msg": "Authentication Failed", "success": false }
```

This is the single most expensive thing to get wrong here. Checking `response.ok` classifies a
dead key as a live key with no activity — and in a multi-account view, an expired key then
looks identical to an idle one. Failure must be detected from the envelope:

- treat **only** an explicit `success: false` as failure — a successful payload that omits the
  field must keep flowing through;
- map `code` yourself; never show `msg`.

### Business codes

Reproduced against the live API on 2026-08-21 by varying only the `Authorization` header.
All of these arrive with **HTTP 200**.

| `code` | `msg` | When | Mapped to |
| --- | --- | --- | --- |
| `1000` | `Authentication Failed` | Key matches the expected format but is not accepted **[observed]** | 401 |
| `1001` | `Authentication parameter not received in Header, unable to authenticate` | No `Authorization` header at all **[observed]** | 401 |
| `401` | `token expired or incorrect` | Token the gateway could not parse as a key **[observed]** | 401 |
| `500` | `404 NOT_FOUND` | Path does not exist **[observed]** | 502, surfaced as `ZAI_CODE_500` |
| anything else | — | **[unknown]** | 502, surfaced as `ZAI_CODE_<code>` |

`403` and `429` are mapped as well, defensively — neither has been seen on the wire. **[inferred]**

### Auth is checked before routing

Under the `/api/monitor/` prefix the gateway authenticates first and resolves the route second:
`/api/monitor/usage/does-not-exist` with an invalid key answers `1000`, exactly like a real
endpoint would. **[observed]** So **an anonymous probe cannot prove an endpoint still exists** —
only a valid key can, and a withdrawn endpoint would answer `code: 500` / `404 NOT_FOUND`.
Outside that prefix the check is reversed: `/api/zzz/nope` answers `500` / `404 NOT_FOUND`
regardless of the key. **[observed]**

### Keep the reason

Collapsing every unmapped code into a bare 502 costs a diagnosis later: a moved endpoint, a
throttle and an unreachable host all render identically and nothing is left to tell them apart.
The route logs `code` and `msg` per endpoint and returns them under `upstream.failures`.

Implemented in [`src/app/api/usage/route.ts`](../src/app/api/usage/route.ts) (`readFailure`,
`classifyTotalFailure`).

---

## Time handling

- `startTime` / `endTime` are `YYYY-MM-DD HH:mm:ss` strings. **[observed]**
- They are interpreted as **Beijing wall clock (`Asia/Shanghai`)** regardless of where the
  caller sits. Building the window in local time skews it by your UTC offset. **[inferred]**
- Both must be supplied together; the app omits the query string entirely when either is
  missing. **[observed]**
- `nextResetTime` in quota payloads is epoch **milliseconds**. **[observed]**

Helpers live in [`src/lib/timezone.ts`](../src/lib/timezone.ts) (`ZAI_TIMEZONE`,
`buildUsageWindow`, `parseWallClock`).

---

## `GET /api/monitor/usage/model-usage?startTime=&endTime=`

Columnar, not row-oriented — parallel arrays sharing one index. **[observed]** Identical for
token and credit plans. **[observed]**

```json
{
  "x_time": ["2026-09-15 17:00", "2026-09-15 18:00"],
  "modelCallCount": [97, 91],
  "tokensUsage": [11852025, 9583075],
  "totalUsage": {
    "totalModelCallCount": 188,
    "totalTokensUsage": 21435100,
    "modelSummaryList": [{ "modelName": "GLM-5.3", "totalTokens": 21433820, "sortOrder": 1 }]
  },
  "modelDataList": [
    { "modelName": "GLM-5.3", "sortOrder": 1, "tokensUsage": [11852025, 9581795], "totalTokens": 21433820 }
  ],
  "modelSummaryList": [{ "modelName": "GLM-5.3", "totalTokens": 21433820, "sortOrder": 1 }],
  "granularity": "hourly"
}
```

- Buckets are hourly; `x_time` entries are Beijing wall-clock strings. Since 2026-09 they have
  **no seconds** (`2026-09-15 18:00`); before that they did. **[observed]**
- The window is returned in full, zero buckets included — 25 buckets for a 24-hour hour-aligned
  window. **[observed]**
- `totalUsage.totalTokensUsage` equals the sum of `tokensUsage`. **[observed]**
- **`modelDataList[].totalTokens` and `modelSummaryList` are not bounded by the requested
  hours.** On a window starting at 18:00 one account got `totalTokens: 234414473` for GLM-5.3
  while that model's own series summed to 145035812 and the grand total was 174813454. On a
  window with no usage before its first hour the two agree. Presumably the per-model totals are
  day-aligned. **[observed]** The app sums each model's `tokensUsage` instead.
- `totalUsage` covers the whole requested range, so a wider window can be summarised without
  touching the series. **[observed]** — this is how the 7-day column works.
- A **7-day range is accepted** and returns ~168 buckets. **[observed]**
- Maximum accepted range: **[unknown]**. 7 days works; nothing longer has been tried.
- Empty windows come back with no `x_time` at all rather than an empty array. **[inferred]**

### Rolling window ≠ Z.AI's "Last 7 Days"

Z.AI's own dashboard offers Today / Last 7 Days / Last 30 Days over **calendar days**
(`2026-07-23 → 2026-07-29`). This app requests a **rolling, hour-aligned window** (`now - 7d`
→ `now`). The two legitimately disagree: on 2026-07-29 Z.AI reported 288.83 M tokens for one
account where this app reported 473.9 M, because the rolling window also covered part of
2026-07-22. **[observed]** Do not treat that gap as a bug without checking the bounds first.

---

## `GET /api/monitor/usage/tool-usage?startTime=&endTime=`

Since 2026-09: columnar, like `model-usage`, for both plan types. **[observed]**

```json
{
  "x_time": ["2026-09-15 14:00", "2026-09-15 15:00"],
  "networkSearchCount": [0, 1],
  "webReadMcpCount": [0, 0],
  "zreadMcpCount": [0, 0],
  "totalUsage": {
    "totalNetworkSearchCount": 1, "totalWebReadMcpCount": 0, "totalZreadMcpCount": 0, "totalSearchMcpCount": 1,
    "toolDetails": [{ "modelName": "search-prime", "totalUsageCount": 1 }],
    "toolSummaryList": [{ "toolCode": "search-prime", "toolName": "联网搜索 MCP", "toolNameI18n": "Web Search MCP", "totalUsageCount": 1, "sortOrder": 1 }]
  },
  "toolDataList": [{ "toolCode": "search-prime", "toolNameI18n": "Web Search MCP", "usageCount": [0, 1], "totalUsageCount": 1 }],
  "toolSummaryList": [{ "toolCode": "search-prime", "toolName": "联网搜索 MCP", "toolNameI18n": "Web Search MCP", "totalUsageCount": 1, "sortOrder": 1 }],
  "granularity": "hourly"
}
```

- `toolName` is Chinese regardless of `Accept-Language`; the English name is `toolNameI18n`.
  **[observed]**
- There are no success/failure counts any more. **[observed]**
- An idle window returns empty `toolSummaryList` / `toolDataList`. **[observed]**

Before 2026-09 the docs here described a plain row array
`[{ "tool", "callCount", "successCount", "failureCount" }]` **[inferred]** — never confirmed on
the wire. The app still accepts that shape.

---

## `GET /api/monitor/usage/quota/limit`

No query parameters — always "right now". **[observed]**

Two shapes, depending on the plan. The plan is not named explicitly; `CREDIT_LIMIT` in the array
is the tell, and it is what Z.AI's own dashboard switches on. **[observed]**

**Token-based plan** (subscriptions from before the credit plans):

```json
{
  "limits": [
    { "type": "TOKENS_LIMIT", "unit": 3, "number": 5, "percentage": 64, "nextResetTime": 1789472583274 },
    { "type": "TOKENS_LIMIT", "unit": 6, "number": 1, "percentage": 100, "nextResetTime": 1789470235980 },
    { "type": "TIME_LIMIT", "unit": 5, "number": 1, "usage": 4000, "currentValue": 15, "remaining": 3985,
      "percentage": 1, "nextResetTime": 1790593435997,
      "usageDetails": [{ "modelCode": "search-prime", "usage": 13 }, { "modelCode": "web-reader", "usage": 2 }] }
  ],
  "level": "max"
}
```

**Credit-based plan:**

```json
{
  "limits": [
    { "type": "CREDIT_LIMIT", "unit": 3, "number": 5, "usage": 28000, "currentValue": 3219, "remaining": 24780,
      "percentage": 11, "nextResetTime": 1789482908408 },
    { "type": "CREDIT_LIMIT", "unit": 6, "number": 1, "usage": 140000, "currentValue": 3219, "remaining": 136780,
      "percentage": 2, "nextResetTime": 1790062251984 }
  ],
  "level": "max"
}
```

Field meanings:

| Field | Meaning |
| --- | --- |
| `type` | `TOKENS_LIMIT` (percentage-only cap), `CREDIT_LIMIT` (credit budget), `TIME_LIMIT` (MCP call count). **[observed]** |
| `unit` | Period unit: `3` hours, `6` weeks, `5` months. **[observed]** Other values **[unknown]**. |
| `number` | Units per window: `unit: 3, number: 5` is the 5-hour window. **[observed]** |
| `percentage` | Integer percent consumed. **[observed]** |
| `currentValue` | Amount used — credits on `CREDIT_LIMIT`, calls on `TIME_LIMIT`. Mapped to `currentUsage`. **[observed]** |
| `usage` | The **cap**, not the usage. Mapped to `total`. The naming is genuinely inverted. **[observed]** |
| `remaining` | Cap minus used, rounded: `28000 − 3219 = 24781` came back as `24780` — credits are fractional (`3219.1337` in `activity`). **[observed]** |
| `nextResetTime` | Epoch ms. **[observed]** |
| `usageDetails` | Per-MCP-tool breakdown; only on `TIME_LIMIT`. **[observed]** |
| `level` | Plan tier: `lite`, `pro`, `max`. **[observed]** `max` on all three accounts; `lite` seen in a third-party report. **[external]** |

Credit plans have **no `TIME_LIMIT`**: MCP calls draw on the same credits as the models
(Z.AI's tooltip: *"Models and Vision MCP features in your plan share the same credits."*).
**[observed]** `TOKENS_LIMIT` still carries no absolute numbers. **[observed]**

The credit-plan account showed the same `currentValue` on both windows early in a weekly cycle,
so both caps are consumed from one stream of spending. **[inferred]**

### Telling the windows apart

Z.AI's own dashboard keys each card on the pair `type` + `unit`: `{unit: 3, type: "TOKENS_LIMIT"}`
is *5 Hours Quota*, `{unit: 6}` *Weekly Quota*, `{unit: 5, type: "TIME_LIMIT"}` *MCP Quota*; for
credit plans `{unit: 3, type: "CREDIT_LIMIT"}` is *5-hour limit* and `{unit: 6}` *Weekly limit*.
**[observed]** in the bundle. The app does the same.

Before `unit` appeared, **`TOKENS_LIMIT` came twice with nothing naming the period.** The app
keeps a fallback for that shape, and the lessons behind it still hold:

- **Reset time does not discriminate.** Late in a weekly cycle the weekly reset is only hours
  away; on 2026-09-15 one account's exhausted weekly cap reset 40 minutes *before* its 5-hour
  window. **[observed]**
- **"Whichever resets soonest" mislabels idle accounts:** an idle 5-hour window used to arrive
  with no `nextResetTime` at all. **[observed]**
- **Array order held:** 5-hour, then weekly, then MCP. **[observed]**

So when `unit` is missing, [`src/lib/quota.ts`](../src/lib/quota.ts) lets order decide and uses
the reset time only to *reject* a 5-hour candidate that resets more than ~6 hours out.

### Reset anchors

| Window | Reset anchor |
| --- | --- |
| 5-hour | First use in the current window **[inferred]** |
| Weekly | Subscription start **[inferred]** |
| MCP (monthly) | Subscription start **[inferred]** |

The weekly and MCP resets share the same time of day (`12:02:49` on one account, `14:03:55` on
another), consistent with both being anchored to the subscription timestamp. **[observed]**

---

## `GET /api/monitor/credit-usage/activity?startTime=&endTime=&type=1`

Lifetime-style counters behind the *Activity* block of Z.AI's dashboard. Despite the path it
answers **token-based plans too**; only `totalCredits` stays `"0.0000"` there. **[observed]**

Z.AI's dashboard asks for whole days: `startTime` is 365 days back at `00:00:00`, `endTime` is
today at `23:59:59`. `type=1` is the personal view; `type=2` is the team view with active-user
counters. **[observed]** in the bundle.

```json
{
  "granularity": "DAY",
  "timezone": "Asia/Shanghai",
  "summary": {
    "totalTokens": 7861995903,
    "peakDailyTokens": 298081078,
    "peakDailyTokensDate": "2026-07-07",
    "totalUsageDurationMs": 1957677158,
    "currentStreakDays": 1,
    "longestStreakDays": 37
  },
  "series": [
    { "date": "2026-09-15", "totalCredits": "3219.1337", "totalTokens": 21435100, "mcpCalls": 0 }
  ]
}
```

- `series` covers every day of the window, zero days included (366 entries). **[observed]**
- Credit amounts are **decimal strings** with four places, not numbers. **[observed]**
- Z.AI renders `totalUsageDurationMs` as `543h 47m`, floored to minutes. **[observed]**
- Whether `summary` is bounded by the window or truly lifetime: **[unknown]** — every account
  checked is younger than a year.

## `GET /api/monitor/credit-usage/usage-detail?startTime=&endTime=&usageType=MODEL|MCP&type=1`

Per-model (or per-MCP-tool) hourly breakdown, split into cached input, uncached input and
output, in both tokens and credits. Answers both plan types. **[observed]** Not used by the app:
the payload is ten parallel arrays per model, and on token plans every credit figure is zero.

```json
{
  "granularity": "HOUR",
  "timezone": "Asia/Shanghai",
  "summary": {
    "cacheHitRate": { "value": "0.9684", "trend": "0.0136" },
    "offPeakUsageRate": { "value": "0.3017", "trend": "-0.6983" },
    "totalCredits": { "value": "3219.1337", "trend": "1.6840" },
    "averageDailyCredits": { "value": "1609.5668", "trend": "1.6840" }
  },
  "modelUsage": {
    "totalUsage": { "totalTokens": 21435100, "totalCredits": "3219.1337" },
    "xTime": ["2026-09-15 18:00:00"],
    "modelDataList": [{
      "modelCode": "glm-5.3", "modelName": "GLM-5.3",
      "uncachedInputTokensUsage": [434162], "cachedInputTokensUsage": [9111296], "inputTokensUsage": [9545458],
      "outputTokensUsage": [36337], "totalTokensUsage": [9581795],
      "uncachedInputCreditsUsage": ["150.2475"], "cachedInputCreditsUsage": ["777.1904"], "inputCreditsUsage": ["927.4379"],
      "outputCreditsUsage": ["43.6044"], "totalCreditsUsage": ["971.0423"]
    }],
    "modelSummaryList": [{ "modelCode": "glm-5.3", "modelName": "GLM-5.3", "totalTokens": 21433820, "totalCredits": "3218.9805" }]
  }
}
```

- `usageType=MCP` returns `mcpUsage` with `mcpDataList[].{mcpCode, mcpNameI18n, mcpCallCount, creditsUsage}`. **[observed]**
- `xTime` here is camelCase and keeps seconds, unlike `x_time` in `model-usage`. **[observed]**
- `summary.*.trend` is sometimes omitted. **[observed]**
- Its `totalTokens` ran slightly ahead of `model-usage` for the same window (179.2 M vs 174.8 M,
  minutes apart) — separate pipelines or separate freshness. **[observed]**

The bundle also references `/api/monitor/credit-usage/sub-account-rank`,
`/api/monitor/usage/sub-account-rank` and `/api/monitor/usage/model-performance-day`; none of
them has been called. **[unknown]**

---

## Freshness, quotas, limits

- **Usage data lags by roughly 10 minutes.** Z.AI's dashboard states it outright: *"Data is not
  real-time. Approx 10 minute delay."* Do not chase small disagreements with a just-finished
  session. **[observed]**
- Credit-plan caps per tier **[external]**; the `max` row matches `usage` on the one credit
  account seen **[observed]**:

  | Tier | Per 5 hours | Per week |
  | --- | --- | --- |
  | Lite | 2 000 | 10 000 |
  | Pro | 12 000 | 60 000 |
  | Max | 28 000 | 140 000 |

- Token-plan caps, in prompts **[external]** — the API reports percentages, never these numbers:

  | Tier | Per 5 hours | Per week |
  | --- | --- | --- |
  | Lite | ~80 | ~400 |
  | Pro | ~400 | ~2 000 |
  | Max | ~1 600 | ~8 000 |

- Premium models cost more at peak. Z.AI's current tooltips: 3× at peak and 1× off-peak on token
  plans, 0.5× credit consumption off-peak on credit plans; peak is Monday–Friday 14:00–18:00
  UTC+8. **[observed]** in the bundle.
- **Rate limits: [unknown].** No documented ceiling and none hit so far. This app issues five
  calls per account per refresh (model-usage ×2, tool-usage, quota/limit, credit-usage/activity),
  so five accounts on a one-minute interval would be 25 calls/minute. If a 429 ever appears it
  is surfaced as `errors.rateLimited`.

---

## How this app consumes it

| Concern | File |
| --- | --- |
| Endpoint calls, envelope handling, error mapping | [`src/app/api/usage/route.ts`](../src/app/api/usage/route.ts) |
| Classifying limits, plan type | [`src/lib/quota.ts`](../src/lib/quota.ts) |
| Model, tool and activity payloads, old and new shapes | [`src/lib/upstream.ts`](../src/lib/upstream.ts) |
| Beijing wall-clock windows | [`src/lib/timezone.ts`](../src/lib/timezone.ts) |
| Client-side shapes | [`src/lib/usage.ts`](../src/lib/usage.ts) |

The proxy route's own request/response contract is documented in the
[README](../README.md#api-reference).

---

## Open questions

- What other `code` values exist besides `200` and `1000`?
- Is there a maximum accepted range for `model-usage`?
- What other `unit` codes exist? `1`, `2`, `4` are presumably seconds, minutes, days.
- Does a `lite` or `pro` token plan ever carry `currentValue` / `usage` on `TOKENS_LIMIT`?
- Is `activity.summary` lifetime or bounded by the window?
- What is the actual rate limit?
