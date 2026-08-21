import type messages from './messages/en.json';

// Ties `useTranslations()` keys to the English message file, so a missing or misspelled key
// is a build error rather than a MISSING_MESSAGE thrown while rendering.
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages;
  }
}
