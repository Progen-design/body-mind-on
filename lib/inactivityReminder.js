/**
 * PŘIPOMÍNKA PŘI NEAKTIVITĚ — jeden e-mail, když se týden nic neděje.
 *
 * PROČ. První skutečný zájemce má 0 měření a 0 odškrtnutých aktivit. Plán mu
 * přišel, aplikace čeká — a nic. Bez jediného impulzu se takový člověk vrátí
 * jen náhodou.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROČ TO NENÍ SOUČÁST `lifecycleEmailRules`
 *
 * Lifecycle sekvence je JEDNORÁZOVÁ a řízená stavem členství (aktivace, trial).
 * Její `alreadySent` logika každý klíč pošle právě jednou — což je přesně to,
 * co tahle připomínka nesmí: má se umět vrátit za týden, ale ne dřív.
 * Míchat obojí do jednoho rozhodovacího stromu by rozbilo obě.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * „MAX 1× TÝDNĚ“ DRŽÍ DATABÁZE, NE KÓD
 *
 * Klíč nese ISO týden (`inactivity_reminder:2026-W34`) a `lifecycle_emails` má
 * unikátní index na `(user_id, trigger_key)`. Druhý pokus v tomtéž týdnu tedy
 * spadne na 23505 a neodešle se — i kdyby cron běžel stokrát, i kdyby se dva
 * běhy překryly. Časové porovnání v kódu by tuhle záruku nedalo.
 */

/** Po kolika dnech bez jediné aktivity se ozveme. */
export const DNU_NEAKTIVITY = 3;

const MS_DEN = 24 * 60 * 60 * 1000;

/**
 * ISO týden jako `2026-W34`. Rozhoduje čtvrtek téhož týdne — standardní
 * ISO 8601 pravidlo, díky kterému přelom roku nevyrobí dva „týdny 1“.
 * @param {Date} d
 * @returns {string}
 */
export function isoTyden(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const denVTydnu = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - denVTydnu);
  const zacatekRoku = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const cislo = Math.ceil(((t - zacatekRoku) / MS_DEN + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(cislo).padStart(2, '0')}`;
}

/**
 * @param {Date} now
 * @returns {string} trigger_key pro `lifecycle_emails`
 */
export function klicPripominky(now) {
  return `inactivity_reminder:${isoTyden(now)}`;
}

/**
 * Kdy naposledy uživatel něco udělal.
 *
 * Bere VŠECHNY tři osy zapojení — jídlo, trénink, návyk. Kdo si odškrtl aspoň
 * jedno, aplikaci používá a připomínka mu nepatří.
 *
 * @param {{ completions?: Array<{completed_at?: string}>, habitLogs?: Array<{created_at?: string, log_date?: string}>, checkins?: Array<{checkin_date?: string, created_at?: string}> }} zdroje
 * @returns {Date|null}
 */
export function posledniAktivita({ completions = [], habitLogs = [], checkins = [] } = {}) {
  const casy = [];
  for (const c of completions || []) if (c?.completed_at) casy.push(new Date(c.completed_at));
  for (const h of habitLogs || []) {
    const v = h?.created_at || h?.log_date;
    if (v) casy.push(new Date(v));
  }
  for (const ch of checkins || []) {
    const v = ch?.checkin_date || ch?.created_at;
    if (v) casy.push(new Date(v));
  }
  const platne = casy.filter((d) => Number.isFinite(d.getTime()));
  if (!platne.length) return null;
  return new Date(Math.max(...platne.map((d) => d.getTime())));
}

/**
 * Má se ozvat?
 *
 * @param {{
 *   posledniAktivitaAt?: Date|null,
 *   registrovanAt?: Date|string|null,
 *   membershipStatus?: string|null,
 *   now?: Date,
 *   jizPoslanoTentoTyden?: boolean,
 * }} p
 * @returns {{ poslat: boolean, duvod: string, dnuBezAktivity: number|null }}
 */
export function maPoslatPripominku({
  posledniAktivitaAt = null,
  registrovanAt = null,
  membershipStatus = null,
  now = new Date(),
  jizPoslanoTentoTyden = false,
} = {}) {
  // Jen lidem, kteří produkt mají. Komu skončil trial nebo zrušil, tomu se
  // připomínkou „vrať se do aplikace“ nepomůže — to je práce jiné sekvence.
  if (!['active', 'trial'].includes(String(membershipStatus || '').toLowerCase())) {
    return { poslat: false, duvod: 'clenstvi_neni_aktivni', dnuBezAktivity: null };
  }
  if (jizPoslanoTentoTyden) {
    return { poslat: false, duvod: 'uz_odeslano_tento_tyden', dnuBezAktivity: null };
  }

  // KDO NIKDY NIC NEUDĚLAL, MĚŘÍ SE OD REGISTRACE.
  // Jinak by `posledniAktivita = null` znamenalo „nekonečně dlouho neaktivní“
  // a e-mail by dostal i člověk, který se registroval před hodinou.
  const odkdy = posledniAktivitaAt ?? (registrovanAt ? new Date(registrovanAt) : null);
  if (!odkdy || !Number.isFinite(odkdy.getTime())) {
    return { poslat: false, duvod: 'neznamy_zacatek', dnuBezAktivity: null };
  }

  const dnu = Math.floor((now.getTime() - odkdy.getTime()) / MS_DEN);
  if (dnu < DNU_NEAKTIVITY) {
    return { poslat: false, duvod: 'jeste_je_brzy', dnuBezAktivity: dnu };
  }
  return { poslat: true, duvod: posledniAktivitaAt ? 'neaktivni' : 'nikdy_nezacal', dnuBezAktivity: dnu };
}

/**
 * PÁTÝ PÁD, NEBO RADŠI NIC.
 *
 * Česky se oslovuje vokativem: „Ahoj Ondro“, ne „Ahoj Ondra“. Jenže vokativ je
 * u souhláskových jmen nepravidelný (Jan→Jane, Petr→Petře, Marek→Marku,
 * Tomáš→Tomáši) a strojově se dá splést snadno. Špatně skloněné jméno působí
 * hůř než žádné.
 *
 * Skloňuje se proto jen tam, kde je pravidlo spolehlivé — jména na -a
 * (Ondra→Ondro, Jana→Jano, Petra→Petro). Ve zbytku případů se jméno vynechá
 * a zůstane samotné „Ahoj,“.
 *
 * @param {string|null|undefined} jmeno
 * @returns {string} '' nebo ' Jméno' v 5. pádě
 */
function osloveniJmenem(jmeno) {
  const krestni = String(jmeno ?? '').trim().split(/\s+/)[0] || '';
  if (krestni.length < 2) return '';
  if (/[a-záčďéěíňóřšťúůýž]$/i.test(krestni) === false) return '';
  if (/a$/i.test(krestni)) return ` ${krestni.slice(0, -1)}o`;
  return '';
}

/**
 * Text e-mailu.
 *
 * TÓN PODLE docs/copy-rules.md: stručně, konkrétně, bez „fitness bullshitu“,
 * bez zdravotních tvrzení a bez výčitek. Cílem je jeden malý krok, ne kázání
 * o disciplíně. Proto se nikde neobjevuje „selhal jsi“ ani „musíš“ — a proto
 * se nabízí to nejmenší možné (odškrtnout jedno jídlo), ne „vrať se k plánu“.
 *
 * Zmínka o zařízení tu záměrně NENÍ: pravidlo o chytrých zařízeních říká, že
 * se nesmí objevit jako podmínka, a v připomínce by navíc přidávala překážku.
 *
 * @param {{ jmeno?: string|null, dnuBezAktivity?: number|null, ctaUrl: string }} p
 * @returns {{ subject: string, text: string }}
 */
export function textPripominky({ jmeno = null, dnuBezAktivity = null, ctaUrl }) {
  const osloveni = `Ahoj${osloveniJmenem(jmeno)},`;
  const dny = Number.isFinite(Number(dnuBezAktivity)) ? Number(dnuBezAktivity) : null;

  const uvod = dny != null && dny >= 7
    ? 'tvůj plán na tebe pořád čeká.'
    : 'pár dní jsme se neviděli.';

  return {
    subject: 'Tvůj plán je připravený',
    text: [
      osloveni,
      '',
      `${uvod} Nic se neděje — stačí jeden malý krok, ať se rozjedeš.`,
      '',
      'Odškrtni si dnes jedno jídlo nebo trénink. To je celé.',
      'Plán se pak sám přizpůsobí tomu, jak ti to jde.',
      '',
      `Otevřít profil: ${ctaUrl}`,
      '',
      'Body & Mind ON',
    ].join('\n'),
  };
}
