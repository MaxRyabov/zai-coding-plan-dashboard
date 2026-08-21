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

Last verified 2026-07-29 against three GLM Coding Plan accounts;
the business codes below were re-checked on 2026-08-21 without a key.

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
{ "code": 0, "msg": "...", "success": true, "data": { ... } }
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

Columnar, not row-oriented — parallel arrays sharing one index. **[inferred]**

```json
{
  "x_time": ["2026-07-29 14:00:00", "2026-07-29 15:00:00"],
  "modelCallCount": [12, 40],
  "tokensUsage": [1200000, 5400000],
  "totalUsage": { "totalModelCallCount": 1044, "totalTokensUsage": 47384255 }
}
```

- Buckets are hourly; `x_time` entries are Beijing wall-clock strings. **[inferred]**
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

A plain array. **[inferred]**

```json
[{ "tool": "browser", "callCount": 150, "successCount": 145, "failureCount": 5 }]
```

---

## `GET /api/monitor/usage/quota/limit`

No query parameters — always "right now". **[observed]**

```json
{
  "limits": [
    { "type": "TOKENS_LIMIT", "percentage": 0 },
    { "type": "TOKENS_LIMIT", "percentage": 100, "nextResetTime": 1785060120000 },
    { "type": "TIME_LIMIT", "percentage": 1, "currentValue": 29,
      "usage": 4000, "remaining": 3971, "nextResetTime": 1787130120000,
      "usageDetails": [{ "modelCode": "...", "usage": 1 }] }
  ]
}
```

Field meanings, where present **[inferred]**:

| Field | Meaning |
| --- | --- |
| `percentage` | Integer percent consumed. |
| `currentValue` | Amount used. Mapped to `currentUsage` in this app. |
| `usage` | The **cap**, not the usage. Mapped to `total`. The naming is genuinely inverted. |
| `remaining` | Cap minus used. |
| `nextResetTime` | Epoch ms. |
| `usageDetails` | Per-model breakdown; only seen on `TIME_LIMIT`. |

### The trap: two different caps share one `type`

**`TOKENS_LIMIT` appears twice — once for the 5-hour cap and once for the 7-day cap.** Nothing
in the payload names the period: same `type`, no label, no duration field. **[observed]**

What does *not* work as a discriminator:

- **Reset time.** The 5-hour cap resets within 5 hours and the weekly cap within 7 days, but
  those are *upper* bounds and they overlap. Late in a weekly cycle the weekly reset is only
  hours away — one account showed a weekly cap resetting 2.4 hours out. **[observed]**
- **"Whichever resets soonest."** An **idle 5-hour window arrives with no `nextResetTime` at
  all**, so it sorts last and the exhausted weekly cap wins the 5-hour slot. This silently
  mislabels every account that has been quiet for a few hours. **[observed]**
- **`currentValue` / `usage` / `remaining`.** Absent on `TOKENS_LIMIT` entries; only
  `TIME_LIMIT` carries them. **[observed]**

What does work:

- **Array order.** The array arrives in the same order Z.AI's own dashboard renders it —
  5-hour, then weekly, then MCP. Held across all three accounts checked, including two where
  the reset-time heuristic gave the opposite answer. **[observed]**

The app therefore lets order decide and uses the reset time only to *reject* a candidate that
could not possibly be a 5-hour window (more than ~6 hours out), which guards against Z.AI
reordering the array. See [`src/lib/quota.ts`](../src/lib/quota.ts) — that rule is covered by
tests built from all three real payloads.

### Known `type` values

| `type` | Meaning | Reset anchor |
| --- | --- | --- |
| `TOKENS_LIMIT` (1st) | 5-hour token cap | First use in the current window **[inferred]** |
| `TOKENS_LIMIT` (2nd) | 7-day token cap | Subscription start **[inferred]** |
| `TIME_LIMIT` | Monthly MCP call cap | Subscription start **[inferred]** |

The weekly and MCP resets share the same minute of day (`12:02` on one account, both entries),
consistent with both being anchored to the subscription timestamp. **[observed]**

Z.AI's own dashboard labels them **5 Hours Quota**, **Weekly Quota**, **MCP Quota**.
**[observed]**

---

## Freshness, quotas, limits

- **Usage data lags by roughly 10 minutes.** Z.AI's dashboard states it outright: *"Data is not
  real-time. Approx 10 minute delay."* Do not chase small disagreements with a just-finished
  session. **[observed]**
- Plan caps, in prompts **[external]** — the API reports percentages, never these numbers:

  | Tier | Per 5 hours | Per week |
  | --- | --- | --- |
  | Lite | ~80 | ~400 |
  | Pro | ~400 | ~2 000 |
  | Max | ~1 600 | ~8 000 |

  The weekly cap is 5× the 5-hour cap (raised from 4× on 2026-02-16).
- GLM-5.2 and GLM-5-Turbo consume quota faster: 3× at peak, 2× off-peak; peak is 14:00–18:00
  UTC+8. **[external]**
- Hitting the weekly cap stops the plan outright — no overage billing, no grace period.
  **[external]**
- **Rate limits: [unknown].** No documented ceiling and none hit so far. This app issues four
  calls per account per refresh (model-usage ×2, tool-usage, quota/limit), so five accounts on
  a one-minute interval would be 20 calls/minute. If a 429 ever appears it is surfaced as
  `errors.rateLimited`.

---

## How this app consumes it

| Concern | File |
| --- | --- |
| Endpoint calls, envelope handling, error mapping | [`src/app/api/usage/route.ts`](../src/app/api/usage/route.ts) |
| Splitting the two `TOKENS_LIMIT` entries | [`src/lib/quota.ts`](../src/lib/quota.ts) |
| Beijing wall-clock windows | [`src/lib/timezone.ts`](../src/lib/timezone.ts) |
| Client-side shapes | [`src/lib/usage.ts`](../src/lib/usage.ts) |

The proxy route's own request/response contract is documented in the
[README](../README.md#api-reference).

---

## Open questions

- What other `code` values exist besides `0` and `1000`?
- Is there a maximum accepted range for `model-usage`?
- Does any endpoint expose the weekly cap in absolute tokens rather than a percentage? Without
  it, a percentage for the 7-day column can only come from `quota/limit`.
- Are `currentValue` / `usage` / `remaining` ever populated on `TOKENS_LIMIT`, e.g. on a
  different plan tier?
- What is the actual rate limit?
