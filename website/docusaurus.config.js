// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Liquid Positions',
  tagline: 'Fungible LP shares for Algebra Integral concentrated liquidity',
  favicon: 'img/favicon.ico',

  url: 'https://organizatione-storm.github.io',
  baseUrl: '/Liquid-Positions-Plugin/',

  organizationName: 'OrganizationE-STORM',
  projectName: 'Liquid-Positions-Plugin',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Liquid Positions',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Docs',
          },
          {
            href: 'https://github.com/OrganizationE-STORM/Liquid-Positions-Plugin',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Introduction', to: '/' },
              { label: 'Architecture', to: '/architecture' },
              { label: 'Deployment', to: '/getting-started/deployment' },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Algebra Integral Docs',
                href: 'https://docs.algebra.finance/',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/OrganizationE-STORM/Liquid-Positions-Plugin',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} E-Storm. Built with Docusaurus.`,
      },
      prism: {
        additionalLanguages: ['solidity'],
      },
    }),
};

export default config;
