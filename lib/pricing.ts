/**
 * JEDINÉ MÍSTO PRAVDY pro ceny START.
 * Když měníš cenu, měníš ji tady — a zároveň v Stripe (nová Price)
 * a v env STRIPE_PRICE_START_MONTHLY. Nikde jinde cenu nepiš natvrdo.
 */
export const START_PRICE_CZK = 599;
export const START_PRICE_LABEL = `${START_PRICE_CZK} Kč/měsíc`;
export const TRIAL_DAYS = 7;

/** START – nabídka pro nového uživatele (trial ještě nevyčerpán). */
export const START_TRIAL_OFFER = {
  priceLabel: `${TRIAL_DAYS} dní zdarma, pak ${START_PRICE_LABEL}`,
  subtitle: null as string | null,
  cta: { label: 'Začít zdarma', href: '/start' },
};

/** START – po vypršení 7denního programu (trial už vyčerpán). */
export const START_POST_TRIAL_OFFER = {
  priceLabel: START_PRICE_LABEL,
  subtitle: `Pokračuj v programu START za ${START_PRICE_LABEL}.`,
  cta: { label: 'Aktivovat předplatné' },
};

export const START_FEATURES = [
  'Osobní tréninkový plán',
  'Týdenní jídelníček',
  '7 pilířů zdraví',
];

export const VIP_PRICE_LABEL = '5 990–6 990 Kč / měsíc';

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
    priceCzk: 5990,
    priceLabel: VIP_PRICE_LABEL,
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
