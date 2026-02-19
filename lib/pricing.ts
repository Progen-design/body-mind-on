export const PRICING = [
  {
    id: 'start',
    name: 'Start',
    priceCzk: 0,
    badge: 'ZDARMA',
    features: [
      '1× ukázkový jídelníček + trénink na týden',
      'Evidence váhy a základních měření',
      'Základní tipy e-mailem',
    ],
    cta: { label: 'Začít zdarma', href: '/start' },
  },
  {
    id: 'individual',
    name: 'Individuální',
    priceCzk: 1490,
    subtitle: 'Plán na míru, ale bez trenéra',
    features: [
      'AI jídelníček + trénink na každý týden (4 týdny)',
      'Plán z tvých měření, automatické úpravy',
      'Tipy pro spánek/stres/regeneraci',
      'E-mailové připomínky a motivace',
      'Bez osobního trenéra – možnost doobjednat',
    ],
    cta: { label: 'Zvolit individuální', href: '/start?plan=individual' },
  },
  {
    id: 'group',
    name: 'Skupina',
    priceCzk: 2490,
    subtitle: 'Plán + skupinová motivace a tréninky',
    features: [
      'Vše z balíčku Individuální',
      '1× skupinový trénink / měsíc (online/offline)',
      'Uzavřená komunita + skupinová Q&A 1× měsíčně',
    ],
    cta: { label: 'Zvolit skupinu', href: '/start?plan=group' },
  },
];

export const ADDON = {
  title: 'Add-on: Osobní trénink 1:1',
  items: ['30 min = 790 Kč', '60 min = 1 190 Kč', '90 min = 1 690 Kč', 'Balíčky 5× / 10× výhodně'],
  note: 'Storno zdarma do 24 h předem',
};
