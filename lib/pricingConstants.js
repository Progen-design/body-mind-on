/**
 * JEDINÉ MÍSTO PRAVDY pro ceny a délku trialu.
 *
 * Proč zvlášť v .js a ne rovnou v pricing.ts:
 * tyhle hodnoty potřebují i node skripty (ověřovací testy, cron nástroje),
 * a node neumí importovat TypeScript. `pricing.ts` z tohohle souboru vychází
 * a jen dopočítává odvozené texty — takže se to nemůže rozejít.
 *
 * Když měníš cenu, měníš ji TADY. A pak ve Stripe (nová Price)
 * a v env STRIPE_PRICE_START_MONTHLY / STRIPE_PRICE_ON_CLUB_MONTHLY.
 */
export const START_PRICE_CZK = 599;
export const ON_CLUB_PRICE_CZK = 1499;
export const TRIAL_DAYS = 7;

export const START_PRICE_LABEL = `${START_PRICE_CZK} Kč/měsíc`;
export const ON_CLUB_PRICE_LABEL = `${ON_CLUB_PRICE_CZK.toLocaleString('cs-CZ')} Kč/měsíc`;

/** Formát s mezerami kolem „/“ (ProgramVariantsSection). */
export const START_VARIANT_PRICE_LABEL = `${START_PRICE_CZK} Kč / měsíc`;
export const ON_CLUB_VARIANT_PRICE_LABEL = `${ON_CLUB_PRICE_CZK.toLocaleString('cs-CZ')} Kč / měsíc`;
