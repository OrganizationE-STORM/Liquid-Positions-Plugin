/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
    },
    {
      type: 'doc',
      id: 'architecture',
      label: 'Architecture',
    },
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/deployment',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/depositing-liquidity',
        'guides/withdrawing-liquidity',
        'guides/migrating-nft-positions',
      ],
    },
    {
      type: 'category',
      label: 'Contract Reference',
      items: [
        'contracts/lp-plugin',
        'contracts/lp-plugin-factory',
        'contracts/lp-token',
        'contracts/lp-token-factory',
        'contracts/lp-callback',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      items: [
        'security/risks',
        'security/audit',
      ],
    },
  ],
};

export default sidebars;
