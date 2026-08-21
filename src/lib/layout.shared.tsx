import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(locale: string): BaseLayoutProps {
  return {
    // No `i18n` here: the option is deprecated, RootProvider already supplies the config, and
    // the object carries a `translations` function that cannot cross into a Client Component.
    nav: {
      title: 'Z.AI Usage Dashboard',
    },
    links: [
      {
        text: 'Dashboard',
        url: `/${locale}`,
        active: 'url',
      },
      {
        text: 'Docs',
        url: `/${locale}/docs`,
        active: 'none',
      },
    ],
  };
}
