import type * as Preset from '@docusaurus/preset-classic';
import type {Config, Plugin} from '@docusaurus/types';

import {themes} from 'prism-react-renderer';

const GITHUB_URL = 'https://github.com/mochi/mochinori';

/**
 * Resolve workspace packages (like @mochinori/images) to their TypeScript
 * sources through the `mochinori-source` export condition, the same way the tests and
 * typechecker do, so the site never needs the libraries built first.
 */
function workspaceSourcePlugin(): Plugin {
  return {
    configureWebpack() {
      // '...' keeps webpack's default conditions after ours
      return {resolve: {conditionNames: ['mochinori-source', '...']}};
    },
    name: 'mochinori-workspace-source',
  };
}

const config: Config = {
  baseUrl: '/',
  favicon: 'favicon.ico',
  headTags: [
    {
      attributes: {
        href: '/img/logo/mochinori-favicon.svg',
        rel: 'icon',
        type: 'image/svg+xml',
      },
      tagName: 'link',
    },
    {
      attributes: {href: '/apple-touch-icon.png', rel: 'apple-touch-icon'},
      tagName: 'link',
    },
    {
      attributes: {href: '/site.webmanifest', rel: 'manifest'},
      tagName: 'link',
    },
  ],
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  onBrokenLinks: 'throw',
  plugins: [workspaceSourcePlugin],
  presets: [
    [
      'classic',
      {
        blog: false,
        docs: {
          editUrl: `${GITHUB_URL}/tree/main/packages/mochinori-website/`,
          sidebarPath: './sidebars.ts',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  tagline: 'Batteries-included extensions for Lexical editors',
  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    footer: {
      copyright: `Copyright © ${new Date().getFullYear()} Bob Ippolito. Built on <a href="https://lexical.dev">Lexical</a>.`,
      links: [
        {
          items: [
            {label: 'Introduction', to: '/docs/intro'},
            {label: '@mochinori/images', to: '/docs/packages/images'},
            {label: '@mochinori/emoji', to: '/docs/packages/emoji'},
          ],
          title: 'Docs',
        },
        {
          items: [
            {label: 'Demos', to: '/demos'},
            {href: 'https://lexical.dev', label: 'Lexical'},
          ],
          title: 'Explore',
        },
        {
          items: [{href: GITHUB_URL, label: 'GitHub'}],
          title: 'More',
        },
      ],
      style: 'dark',
    },
    image: 'icon-512.png',
    navbar: {
      items: [
        {
          label: 'Docs',
          position: 'left',
          sidebarId: 'docs',
          type: 'docSidebar',
        },
        {label: 'Demos', position: 'left', to: '/demos'},
        {
          'aria-label': 'GitHub repository',
          className: 'header-github-link',
          href: GITHUB_URL,
          position: 'right',
        },
      ],
      logo: {
        alt: 'mochinori',
        height: 32,
        src: 'img/logo/mochinori-logo.svg',
        srcDark: 'img/logo/mochinori-logo-dark.svg',
      },
    },
    prism: {
      darkTheme: themes.dracula,
      theme: themes.github,
    },
  } satisfies Preset.ThemeConfig,
  title: 'mochinori',
  // Emit docs/intro.html rather than docs/intro/index.html, so /docs/intro is
  // served directly by Workers static assets without a redirect.
  trailingSlash: false,
  url: 'https://mochinori.dev',
};

export default config;
