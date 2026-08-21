/**
 * Mapování Stripe price_id → membership tier.
 * Env: STRIPE_PRICE_START_MONTHLY, STRIPE_PRICE_ON_CLUB_MONTHLY, STRIPE_PRICE_VIP_MONTHLY
 *
 * KAŽDÁ PROMĚNNÁ SNESE VÍC PRICE ID ODDĚLENÝCH ČÁRKOU. První je kanonické —
 * jen to se použije pro nový checkout. Ostatní jsou historické ceny, které už
 * neprodáváme, ale pořád na nich někdo běží.
 *
 * PROČ. Do 13. 8. 2026 tu byla jedna cena na tier. Když se START přecenil
 * z 499 na 599 Kč (`price_1T7jKN…` → `price_1Tsq2D…`), staré price ID z mapy
 * vypadlo — a webhook přestal poznávat tier u všech, kdo na staré ceně zůstali.
 * 12. 8. ve 23:33 tak skončily dvě měsíční obnovy jako `skipped_unknown_price`:
 * Stripe nám řekl „tenhle člověk zaplatil" a my to zahodili s HTTP 200.
 *
 * Horší směr než neaktivace je zrušení: `customer.subscription.deleted` se
 * zahodí stejně, členství zůstane `active` a člověk přestane platit.
 *
 * Přecenění se bude opakovat — hlavně při přechodu ze sandboxu do ostrého
 * režimu, kde vzniknou úplně nová price ID. Stará hodnota se proto NESMÍ
 * z env mazat, jen se před ni připíše nová.
 */

const TIER_ENV_KEYS = {
  START: 'STRIPE_PRICE_START_MONTHLY',
  ON_CLUB: 'STRIPE_PRICE_ON_CLUB_MONTHLY',
  VIP: 'STRIPE_PRICE_VIP_MONTHLY',
};

/**
 * Rozpadne hodnotu env proměnné na seznam price ID.
 * Snese čárku, středník i nový řádek — kopírování ze Stripe dashboardu.
 *
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
export function parseStripePriceIds(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @returns {Record<string, string>} priceId → tier
 */
export function buildStripePriceToTierMap(env = process.env) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const [tier, envKey] of Object.entries(TIER_ENV_KEYS)) {
    for (const priceId of parseStripePriceIds(env[envKey])) {
      // První zápis vyhrává: kdyby totéž price ID viselo omylem u dvou tierů,
      // ať se tier nemění podle pořadí klíčů v objektu. Konflikt vypíše
      // stripeTierEnvStatus(), aby to nezůstalo jen tady.
      if (!map[priceId]) map[priceId] = tier;
    }
  }
  return map;
}

/**
 * @param {string|null|undefined} priceId
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function resolveTierFromStripePriceId(priceId, env = process.env) {
  const id = String(priceId || '').trim();
  if (!id) return null;
  const map = buildStripePriceToTierMap(env);
  return map[id] || null;
}

/**
 * @param {import('stripe').Stripe.Subscription} subscription
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function resolveTierFromStripeSubscription(subscription, env = process.env) {
  const priceId = subscription?.items?.data?.[0]?.price?.id
    || subscription?.items?.data?.[0]?.plan?.id
    || null;
  return resolveTierFromStripePriceId(priceId, env);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ configured: string[], missing: string[], historicke: Record<string, string[]>, konflikty: string[] }}
 */
export function stripeTierEnvStatus(env = process.env) {
  const configured = [];
  const missing = [];
  /** @type {Record<string, string[]>} */
  const historicke = {};
  /** @type {string[]} */
  const konflikty = [];
  /** @type {Record<string, string>} */
  const videno = {};

  for (const [tier, envKey] of Object.entries(TIER_ENV_KEYS)) {
    const ids = parseStripePriceIds(env[envKey]);
    if (ids.length) configured.push(tier);
    else missing.push(envKey);

    if (ids.length > 1) historicke[tier] = ids.slice(1);

    for (const id of ids) {
      if (videno[id] && videno[id] !== tier) {
        konflikty.push(`${id} je u ${videno[id]} i ${tier}`);
      } else {
        videno[id] = tier;
      }
    }
  }
  return { configured, missing, historicke, konflikty };
}

/**
 * Kanonická cena tieru — ta, na kterou se zakládá NOVÝ checkout.
 * Historické ceny z téže proměnné se sem záměrně nedostanou; slouží jen
 * k rozpoznání tieru u předplatných, která na nich už běží.
 *
 * @param {string} tier
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function getStripePriceIdForTier(tier, env = process.env) {
  const t = String(tier || '').toUpperCase();
  const envKey = TIER_ENV_KEYS[t];
  if (!envKey) return null;
  return parseStripePriceIds(env[envKey])[0] || null;
}

/**
 * @param {string|null|undefined} expectedTier
 * @param {string|null|undefined} resolvedTier
 * @returns {boolean}
 */
export function tiersMatch(expectedTier, resolvedTier) {
  const a = String(expectedTier || '').toUpperCase();
  const b = String(resolvedTier || '').toUpperCase();
  if (!a || !b) return true;
  return a === b;
}
