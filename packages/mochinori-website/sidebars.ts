import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'getting-started',
    {
      items: ['packages/images', 'packages/emoji'],
      label: 'Packages',
      type: 'category',
    },
    {
      items: ['contributing/monorepo', 'contributing/cloudflare'],
      label: 'Contributing',
      type: 'category',
    },
  ],
};

export default sidebars;
