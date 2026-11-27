# Z.AI Usage Dashboard

This Next.js dashboard displays Z.AI model and tool usage, quotas, and credit activity. The browser keeps account keys in an encrypted local vault, and `POST /api/usage` proxies usage requests to Z.AI.

## Local development

- `npm run dev` starts the dashboard at `http://localhost:3377`.
- Run `npm run lint` after code changes.
- Run `npm run build` when changes affect the app build, routes, or shared types.

## Change-specific checks

- **Dashboard UI:** Exercise the changed flow in the browser. When changing user-facing copy, update the corresponding entries in all seven `messages/*.json` catalogs. Supported locales are defined in `src/i18n/routing.ts`.
- **Usage API:** Use the contract in `README.md` and the upstream notes in `docs/zai-api.md`. Check partial upstream failure as well as the success path. Keep available usage data visible on partial failure and preserve the distinction between missing data and zero usage.
- **Account vault:** Check that an existing vault can still be unlocked and that the legacy `zai-api-key` entry can still be migrated. Use synthetic credentials for checks. Keep API keys and vault passwords out of source, fixtures, and logs.
