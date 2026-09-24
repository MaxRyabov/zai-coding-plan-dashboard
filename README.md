<div align="center">

**[English](README.md)** | **[简体中文](README.zh-CN.md)** | **[日本語](README.ja.md)** | **[한국어](README.ko.md)** | **[Español](README.es.md)** | **[Français](README.fr.md)** | **[Deutsch](README.de.md)**

<p>

# Z.AI Usage Dashboard

A modern Next.js dashboard for monitoring Z.AI API usage with real-time analytics and multi-language support.

</div>

## Features

- **Multiple Accounts** - Watch every Z.AI key at once: a summary table with a totals row, plus a full dashboard per account
- **Encrypted Key Storage** - Keys are encrypted with a master password (PBKDF2 + AES-GCM); only ciphertext reaches `localStorage`
- **Real-time Usage Tracking** - Monitor model calls, token usage, and tool performance
- **Quota Management** - Visual progress bars for limits (5-hour tokens, monthly MCP usage)
- **Time-series Analytics** - Interactive charts showing usage trends over time
- **Auto-refresh** - Every account refreshed in parallel, on an interval you choose (off / 1 / 5 / 15 min)
- **Multi-language Support** - 7 locales (English, Chinese, Japanese, Korean, Spanish, French, German)
- **Dark/Light Mode** - Material You-inspired design with theme toggle

## Screenshot

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/CNSeniorious000/zai-coding-plan-dashboard/main/.github/screenshots/screenshot-en-dark.webp">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/CNSeniorious000/zai-coding-plan-dashboard/main/.github/screenshots/screenshot-en-light.webp">
  <img alt="Z.AI Usage Dashboard Screenshot" src="https://raw.githubusercontent.com/CNSeniorious000/zai-coding-plan-dashboard/main/.github/screenshots/screenshot-en-dark.webp">
</picture>

## Tech Stack

- **Next.js 16** - App Router with React 19
- **TypeScript** - Full type safety
- **Tailwind CSS v4** - Utility-first styling
- **Recharts** - Data visualization
- **next-intl** - Internationalization
- **Radix UI** - Accessible components

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3377](http://localhost:3377)

## API Reference

Z.AI's own monitoring endpoints are undocumented. Everything this project has established
about them — payload shapes, the auth failure that arrives as HTTP 200, the two token caps
that share one `type`, and what is still unknown — is written down in
[`docs/zai-api.md`](docs/zai-api.md). **Read it before changing anything that talks to
`api.z.ai`.**

### POST /api/usage

The dashboard's own proxy route. Fetches usage statistics from the Z.AI API.

**Request Body:**

```json
{
  "apiKey": "string (required) - Z.AI API key in format [hex32].[alphanum16]",
  "startTime": "string (optional) - Beijing wall clock, YYYY-MM-DD HH:mm:ss",
  "endTime": "string (optional) - Beijing wall clock, YYYY-MM-DD HH:mm:ss",
  "extendedStartTime": "string (optional) - second, wider window; totals only",
  "extendedEndTime": "string (optional) - must be given together with extendedStartTime"
}
```

Supplying the extended pair adds one more `model-usage` call over the wider range and
populates `extendedUsage` in the response. The dashboard uses it for the 7-day column.

**Response:**

```json
{
  "modelUsage": {
    "timeSeries": [
      {
        "time": "14:00",
        "fullTime": "2026-09-15 14:00",
        "timestamp": 1789452000000,
        "calls": 1234,
        "tokens": 567890
      }
    ],
    "totalCalls": 50000,
    "totalTokens": 10000000,
    "models": [{ "name": "GLM-5.3", "tokens": 9500000 }, { "name": "GLM-5.3-Flash", "tokens": 500000 }]
  },
  "toolUsage": [
    { "tool": "Web Search MCP", "callCount": 150 }
  ],
  "quotaLimit": {
    "billing": "credits",
    "level": "max",
    "limits": [
      {
        "kind": "tokens",
        "type": "CREDIT_LIMIT",
        "measure": "credits",
        "percentage": 11,
        "currentUsage": 3219,
        "total": 28000,
        "remaining": 24780,
        "nextResetTime": 1789482908408
      },
      {
        "kind": "week",
        "type": "CREDIT_LIMIT",
        "measure": "credits",
        "percentage": 2,
        "currentUsage": 3219,
        "total": 140000,
        "remaining": 136780,
        "nextResetTime": 1790062251984
      }
    ]
  },
  "extendedUsage": {
    "totalCalls": 9800,
    "totalTokens": 71000000
  },
  "activity": {
    "totalTokens": 7861995903,
    "peakDailyTokens": 298081078,
    "peakDailyTokensDate": "2026-07-07",
    "totalUsageDurationMs": 1957677158,
    "currentStreakDays": 1,
    "longestStreakDays": 37
  },
  "upstream": {
    "status": { "modelUsage": 200, "toolUsage": 200, "quotaLimit": 200, "extendedUsage": 200, "activity": 200 }
  }
}
```

`quotaLimit` depends on the plan. `billing: "credits"` plans report both windows in absolute
credits and have no MCP limit; `billing: "tokens"` plans report the 5-hour (`kind: "tokens"`)
and weekly (`kind: "week"`) windows as percentages only, plus a monthly MCP limit
(`kind: "mcp"`, `measure: "calls"`). `kind` is the stable discriminator; `type` is Z.AI's raw
limit type, not a label. The upstream shapes are described in [docs/zai-api.md](docs/zai-api.md).

`toolUsage` rows carry `successCount` / `failureCount` only when Z.AI still sends them.

`extendedUsage` and `activity` are `null` when not requested or not answered, so the UI can
tell "no data" from "no usage". Neither affects the all-endpoints-failed verdict; the
`extendedUsage` status key appears only when the window was requested.

`upstream.status` carries the per-endpoint result so a dead key can be told apart from an idle
one. Z.AI answers a bad key with HTTP 200 and `{"success": false, "code": 1000}`, which this
route translates into a real **401** with `{"error": "HTTP_401"}`. When only some endpoints
fail, the response stays 200 and the failing entries show their status.

## Development

```bash
# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Project Structure

```
src/
├── app/
│   ├── [locale]/          # Localized routes
│   │   ├── page.tsx       # Main dashboard
│   │   └── docs/          # Documentation
│   └── api/
│       └── usage/
│           └── route.ts   # Usage API endpoint
├── components/
│   ├── Dashboard.tsx      # Main dashboard component
│   ├── UsageCharts.tsx    # Data visualization
│   └── ui/                # Reusable UI components
├── i18n/                  # Internationalization config
└── lib/                   # Utilities
```

## API Key Format

Valid Z.AI API keys follow the pattern: `[a-f0-9]{32}\.[A-Za-z0-9]{16}`

Example: `1a2b3c4d5e6f7890abcdef1234567890.ABC123def456`

## Documentation

Full documentation available at `/docs` in the app.

## License

Private project.

---

<div align="center">

**[English](README.md)** | **[简体中文](README.zh-CN.md)** | **[日本語](README.ja.md)** | **[한국어](README.ko.md)** | **[Español](README.es.md)** | **[Français](README.fr.md)** | **[Deutsch](README.de.md)**

</div>
