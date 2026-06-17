/** START – nabídka pro nového uživatele (trial ještě nevyčerpán). */
export const START_TRIAL_OFFER = {
  priceLabel: '7 dní zdarma, pak 499 Kč/měsíc',
  subtitle: null as string | null,
  cta: { label: 'Začít zdarma', href: '/start' },
};

/** START – po vypršení 7denního programu (trial už vyčerpán). */
export const START_POST_TRIAL_OFFER = {
  priceLabel: '499 Kč/měsíc',
  subtitle: 'Pokračuj v programu START za 499 Kč/měsíc.',
  cta: { label: 'Aktivovat předplatné' },
};

export const START_FEATURES = [
  'Osobní tréninkový plán',
  'Týdenní jídelníček',
  '7 pilířů zdraví',
];

export const PRICING = [
  {
    id: 'start',
    name: 'Start',
    priceCzk: 0,
    priceLabel: START_TRIAL_OFFER.priceLabel,
    features: START_FEATURES,
    cta: START_TRIAL_OFFER.cta,
  },
  {
    id: 'on-club',
    name: 'ON Club',
    priceCzk: 1499,
    badge: 'Doporučeno',
    subtitle: 'Tvůj osobní AI trenér vždy po ruce.',
    features: [
      'VŠE ze START +',
      'Osobní AI trenér 24/7',
      'Adaptivní plán dle výsledků',
      'Motivační komunita',
      'Video konzultace s experty',
      'Detailní statistiky a analýzy',
      'Pokročilé recepty a variace',
    ],
    cta: { label: 'Připojit se k ON Clubu', href: '/on-club' },
  },
  {
    id: 'vip',
    name: 'VIP Coaching',
    priceCzk: 3999,
    subtitle: 'Luxusní péče pro ty, co chtějí víc.',
    features: [
      'VŠE z ON Club +',
      'Elitní lidský kouč',
      'Strategie šitá na míru',
      'Týdenní 1:1 video konzultace',
      'Prioritní podpora',
      'Individuální úpravy plánu',
      'Exkluzivní obsah a tipy',
    ],
    cta: { label: 'Chci VIP přístup', href: '/chci-vip' },
  },
];

export const ADDON = {
  title: 'Add-on: Osobní trénink 1:1',
  items: ['30 min = 790 Kč', '60 min = 1 190 Kč', '90 min = 1 690 Kč', 'Balíčky 5× / 10× výhodně'],
  note: 'Storno zdarma do 24 h předem',
};
