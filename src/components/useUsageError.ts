'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Turns an error code from `/api/usage` into readable text.
 *
 * A hook rather than a plain function because next-intl types `t` against the literal
 * message keys — mapping codes here keeps every key a literal at the call site.
 */
export function useUsageErrorText() {
  const t = useTranslations();

  return useCallback((code: string | null | undefined) => {
    switch (code) {
      case 'HTTP_401':
        return t('errors.invalidKey');
      case 'HTTP_403':
        return t('errors.forbidden');
      case 'HTTP_429':
        return t('errors.rateLimited');
      case 'UPSTREAM_UNREACHABLE':
        return t('errors.unreachable');
      default: {
        // Z.AI's own business code, forwarded when it has no HTTP equivalent — showing the
        // number beats a generic 502 the user cannot look up anywhere.
        const zai = /^ZAI_CODE_(\d+)$/.exec(code ?? '');
        if (zai) return t('errors.upstreamCode', { code: zai[1] });

        const match = /^HTTP_(\d{3})$/.exec(code ?? '');
        return match ? t('errors.upstream', { status: match[1] }) : t('errors.fetchFailed');
      }
    }
  }, [t]);
}
