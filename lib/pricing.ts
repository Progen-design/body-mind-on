/**
 * Ceny žijí v `pricingConstants.js` — potřebují je i node skripty,
 * které neumí TypeScript. Tady je jen re-exportujeme, aby zbytek appky
 * mohl dál importovat z `lib/pricing`. Jedno místo pravdy zůstává jedno.
 */
import {
  START_PRICE_CZK,
  START_PRICE_LABEL,
  ON_CLUB_PRICE_CZK,
  ON_CLUB_PRICE_LABEL,
  START_VARIANT_PRICE_LABEL,
  ON_CLUB_VARIANT_PRICE_LABEL,
  TRIAL_DAYS,
} from './pricingConstants.js';

export {
  START_PRICE_CZK,
  START_PRICE_LABEL,
  ON_CLUB_PRICE_CZK,
  ON_CLUB_PRICE_LABEL,
  START_VARIANT_PRICE_LABEL,
  ON_CLUB_VARIANT_PRICE_LABEL,
  TRIAL_DAYS,
};

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
  'Týdenní automatická úprava plánu',
  'Napojení chytrého zařízení — nastavení zdarma',
  '7 pilířů zdraví',
];

export const VIP_PRICE_LABEL = '5 990–6 990 Kč / měsíc';

/**
 * Poslední odrážka nabídky START — vždy dole, sundává riziko z rozhodnutí
 * (PROMPT_UX_DNES.md bod C). ON Club dostává stejnou větu doplněnou ke svým
 * odrážkám, ne vlastní text — riziko je stejné u obou tierů.
 */
export const CANCEL_ANYTIME_LINE = 'Zrušíš kdykoli. Ve zkušebním období neplatíš nic.';

/**
 * Důvody ke koupi, ne výčet funkcí (PROMPT_UX_DNES.md bod C). `START_FEATURES`
 * výš zůstává výčet toho, co appka umí — používá ho onboarding/marketing.
 * Tohle je samostatný text pro prodejní karty (Dnes, Účet a předplatné), ať
 * se úpravou jednoho textu nerozjede druhý.
 */
export const START_REASONS = [
  'Jídelníček i trénink podle tvých čísel, ne obecná tabulka',
  // PROMPT_UX_DOLADENI.md bod E — „podle toho, jak ti šel ten minulý" byl
  // slib, který appka neplní. Týdenní přepočet (lib/weeklyWeightRecalc.js)
  // jede podle sedmidenního mediánu odvozené váhy, ne podle adherence:
  // denní check-in, odškrtaná jídla ani odcvičené tréninky do něj nevstupují.
  'Každý týden se kalorie přepočítají podle tvé aktuální váhy',
  'Jídlo, které ti nesedí, vyměníš jedním klikem — kalorie dne zůstanou sedět',
  'Nákupní seznam se poskládá sám z tvého jídelníčku',
  'TED odpovídá na tvůj konkrétní plán, ne obecně',
  CANCEL_ANYTIME_LINE,
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
    priceCzk: ON_CLUB_PRICE_CZK,
    badge: 'Doporučeno',
    subtitle: 'Komunita a vedení po STARTu — plán se sám upravuje podle vývoje.',
    features: [
      'Napojení chytrého zařízení — nastavení zdarma',
      'VŠE ze START +',
      'Komunita a automatika',
      // PROMPT_UX_DOLADENI.md bod D — „AI trenér TED 24/7 (brzy)" tvrdilo
      // dvě nepravdy: TED není „brzy", je živý (Header.tsx, TedContext.tsx —
      // `dostupny: true` bez podmínky), a není to rozdíl ON Clubu proti
      // STARTu — `api/coach-chat.js` (`requireActiveMembership`) i
      // `lib/membershipHelpers.js` (`isAccessAllowed`) TEDa nijak
      // tier-specificky nerozlišují, START ho má úplně stejně
      // (`START_REASONS` ho ostatně slibuje taky). Odrážka šla pryč — je to
      // beze zbytku „VŠE ze START +" o dva řádky výš, ne zvláštní přínos.
      'Každý měsíc živě s Ondrou — ptej se na trénink, jídlo a motivaci',
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
