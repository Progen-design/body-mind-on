/**
 * Běh generátoru: fronta → model → validace → zápis do katalogu.
 *
 * Nutrice se počítá ZE SUROVIN ještě před vložením, takže se recept zapíše
 * jediným INSERTem se skutečnými čísly, nebo vůbec. V katalogu tím nikdy
 * nevznikne řádek bez nutrice — ani na okamžik, ani při pádu procesu.
 */
import OpenAI from 'openai';
import { jeInfrastrukturniChyba, popisChybyBehu } from './plan/chybyGeneratoru.js';
export { jeInfrastrukturniChyba, popisChybyBehu };
import { supabaseServer } from './supabaseServer.js';
import {
  RECIPE_GEN_MODEL,
  RECIPE_GEN_TEMPERATURE,
  RECIPE_GEN_PROMPT_SHA256,
  RECIPE_GEN_BATCH,
  buildGeneratorInput,
  existujiciKombinaceSurovin,
  generateRecipeBatch,
  isDuplicateRecipe,
  isRecipeGenEnabled,
  maxPerRun,
  maxPerDay,
  nactiPovoleneSuroviny,
  surovinyProDietu,
  normalizeRecipeName,
  surovinyMimoSeznam,
  jednotkyMimoSeznam,
  vyrobenoZa24h,
} from './recipeGenerator.js';
import { nactiFrontu } from './recipeGenerationQueue.js';
import { bilkovinaProPolozku, receptSplnujeBilkovinu } from './plan/rotaceBilkovin.js';
import { podilBilkovinReceptu, receptSplnujePodil, rozparsujHint } from './plan/proteinHint.js';
import { podilTukuReceptu, receptNepresahujeStropTuku, validacniStropTuku } from './plan/fatHint.js';
export { bilkovinaProPolozku };

/** Recepty téhož slotu — pro dedup i pro seznam „tohle už máme“ v promptu. */
async function nactiExistujici(mealType, client) {
  const { data, error } = await client
    .from('recipes_catalog')
    .select('name_cs, ingredients')
    .eq('meal_type', mealType)
    .not('name_cs', 'is', null);
  if (error) throw new Error(`recipes_catalog: ${error.message}`);
  return data || [];
}

/**
 * ZÁPIS O BĚHU — I KDYŽ NIC NEVZNIKLO.
 *
 * Do 26. 8. 2026 se do `ai_runs` psalo jen po ÚSPĚŠNÉM volání modelu. Běh,
 * který nic nevyrobil, nezanechal stopu — a mlčení vypadalo stejně jako
 * úspěch. Generátor kvůli tomu stál 55 hodin, aniž by to bylo z dat poznat:
 * 24.–26. 8. proběhlo devět cronů, každý vrátil HTTP 200 a `zapsano: 0`,
 * protože OpenAI odpovídalo `429 You have no credits remaining`. Jediné,
 * co se rozsvítilo, byl watchdog — po dvou dnech.
 *
 * `purpose` je schválně jiný než u `recipe_generation`: tam patří jedno
 * volání modelu, sem jeden běh cronu. Denní strop se počítá z katalogu
 * (viz `vyrobenoZa24h`), takže tyhle řádky do něj nezasahují.
 *
 * Selhání zápisu NESMÍ shodit běh — je to diagnostika, ne práce.
 */
async function zapisZaznamOBehu(client, vysledek, zacatek) {
  try {
    const chyby = Array.isArray(vysledek?.chyby) ? vysledek.chyby : [];
    await client.from('ai_runs').insert({
      purpose: 'recipe_generator_beh',
      model: RECIPE_GEN_MODEL,
      // `temperature` je NOT NULL. Bez ni insert spadne a diagnostika by
      // mlcela zrovna ve chvili, kdy je potreba — chytil to db test.
      temperature: RECIPE_GEN_TEMPERATURE,
      prompt_sha256: RECIPE_GEN_PROMPT_SHA256,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: Number(vysledek?.cena_usd ?? 0),
      result: {
        zapsano: vysledek?.zapsano ?? 0,
        // `reason` je vyplněný jen u přeskočených běhů (prázdná fronta, denní
        // strop, vypnuto). U doběhlého běhu je null a mluví `chyby`.
        reason: vysledek?.reason ?? null,
        skipped: vysledek?.skipped === true,
        zahozeno: vysledek?.zahozeno?.length ?? 0,
        trvalo_ms: Date.now() - zacatek,
      },
      // Prázdný běh BEZ chyby je legitimní (fronta došla). Prázdný běh
      // S chybou je porucha a musí být vidět jako porucha.
      error: chyby.length > 0 ? chyby.join(' | ').slice(0, 2000) : null,
    });
  } catch (chyba) {
    console.error(JSON.stringify({
      source: 'recipe-generator',
      event: 'zaznam_o_behu_selhal',
      error: chyba instanceof Error ? chyba.message : String(chyba),
    }));
  }
}

/**
 * @param {{ dryRun?: boolean, limit?: number, queueId?: number|null, client?: any, openai?: OpenAI }} [opts]
 */
export async function runRecipeGenerator(opts = {}) {
  const zacatek = Date.now();
  const client = opts.client || supabaseServer;

  // Suchý běh nic nemění, takže po sobě nenechává ani záznam.
  if (opts.dryRun === true) return provedBeh(opts);

  try {
    const vysledek = await provedBeh(opts);
    await zapisZaznamOBehu(client, vysledek, zacatek);
    return vysledek;
  } catch (chyba) {
    // I pád se musí zapsat. Jinak je nerozeznatelný od běhu, který nenaběhl.
    await zapisZaznamOBehu(
      client,
      { zapsano: 0, reason: 'vyjimka', chyby: [chyba instanceof Error ? chyba.message : String(chyba)] },
      zacatek,
    );
    throw chyba;
  }
}

/**
 * @param {{ dryRun?: boolean, limit?: number, queueId?: number|null, client?: any, openai?: OpenAI }} [opts]
 */
async function provedBeh(opts = {}) {
  const client = opts.client || supabaseServer;
  const dryRun = opts.dryRun === true;

  if (!isRecipeGenEnabled()) {
    return { skipped: true, reason: 'disabled', zapsano: 0 };
  }

  const stropBehu = Math.min(opts.limit ?? maxPerRun(), maxPerRun());
  const zaDen = await vyrobenoZa24h(client);
  const zbyvaDnes = Math.max(0, maxPerDay() - zaDen);
  const strop = Math.min(stropBehu, zbyvaDnes);

  if (strop <= 0) {
    return { skipped: true, reason: 'denni_strop_vycerpan', vyrobeno_za_24h: zaDen, zapsano: 0 };
  }

  const fronta = await nactiFrontu(20, client, { queueId: opts.queueId ?? null });
  if (!fronta.length) {
    return { skipped: true, reason: opts.queueId ? 'polozka_nenalezena' : 'prazdna_fronta', zapsano: 0 };
  }

  // Slovník se filtruje AŽ podle diety konkrétní položky fronty — jeden
  // společný seznam pro celý běh by veganské položce nabídl i maso.
  const slovnik = await nactiPovoleneSuroviny(client);
  const proPolozku = (p) => {
    const nazvy = surovinyProDietu(slovnik, p.diet_tags);
    return { nazvy, set: new Set(nazvy.map(normalizeRecipeName)) };
  };

  // --- Dry run: co BY se generovalo, včetně promptu -------------------------
  if (dryRun) {
    const plan = [];
    let zbyva = strop;
    for (const p of fronta) {
      if (zbyva <= 0) break;
      const kusu = Math.min(p.pozadovano - p.vyrobeno, RECIPE_GEN_BATCH, zbyva);
      if (kusu <= 0) continue;
      const existujici = await nactiExistujici(p.meal_type, client);
      plan.push({
        queue_id: p.id,
        priorita: p.priorita,
        zdroj: p.zdroj,
        specifikace: {
          meal_type: p.meal_type,
          diet_tags: p.diet_tags,
          kcal: `${p.kcal_min}–${p.kcal_max}`,
          max_active_min: p.max_active_min,
          pozadovano: p.pozadovano,
          vyrobeno: p.vyrobeno,
        },
        vygenerovalo_by: kusu,
        slovnik_po_filtru: proPolozku(p).nazvy.length,
        vstup_pro_model: buildGeneratorInput(
          p, proPolozku(p).nazvy, existujici.map((e) => e.name_cs), kusu,
          [], null, null, existujiciKombinaceSurovin(existujici), p?.fat_hint ?? null,
        ),
      });
      zbyva -= kusu;
    }
    return {
      dry_run: true,
      zapsano: 0,
      model: RECIPE_GEN_MODEL,
      temperature: RECIPE_GEN_TEMPERATURE,
      prompt_sha256: RECIPE_GEN_PROMPT_SHA256,
      strop_behu: strop,
      vyrobeno_za_24h: zaDen,
      slovni_zasoba: slovnik.length,
      polozek_fronty: fronta.length,
      plan,
    };
  }

  // --- Ostrý běh -----------------------------------------------------------
  const openai = opts.openai || new OpenAI({ apiKey: String(process.env.OPENAI_API_KEY || '').trim() });
  let zapsano = 0;
  let cenaCelkem = 0;
  const zahozeno = [];
  const chyby = [];
  let zbyva = strop;

  for (const p of fronta) {
    if (zbyva <= 0) break;
    const kusu = Math.min(p.pozadovano - p.vyrobeno, RECIPE_GEN_BATCH, zbyva);
    if (kusu <= 0) continue;

    await client.from('recipe_generation_queue')
      .update({ stav: 'running', pokusu: p.pokusu + 1, updated_at: new Date().toISOString() })
      .eq('id', p.id);

    let existujici = await nactiExistujici(p.meal_type, client);
    let nedohledane = [];
    // Jednotky mimo g/ml z předchozího pokusu — docs/DALSI_KROK.md 8.9.
    // Vlastní pole, ODDĚLENÉ od `nedohledane`: je to jednotka, ne surovina.
    let nedohledaneJednotky = [];
    // Překročení tvrdého stropu tuku z předchozího pokusu — docs/DALSI_KROK.md
    // 8.13. Vlastní pole, stejný důvod jako u jednotek výš: není to název
    // suroviny, do `nedohledane` nepatří.
    let nedohledaneTuk = [];
    let zapsanoZPolozky = 0;
    let chybaVolani = null;
    const { nazvy: povoleneProPolozku, set: povoleneSet } = proPolozku(p);
    const hlavniBilkovina = bilkovinaProPolozku(p, existujici, povoleneProPolozku);
    // Objednavka muze vedle zdroje nest i minimalni podil bilkovin na
    // kaloriich. Bez nej se chova jako driv.
    const minPodilBilkovin = rozparsujHint(p?.protein_hint).podil;
    // Tukový strop, docs/DALSI_KROK.md 8.8. Prostý sloupec, žádné parsování —
    // na rozdíl od protein_hint tuk nenese "zdroj", jen číslo.
    const maxPodilTuku = Number.isFinite(Number(p?.fat_hint)) && Number(p.fat_hint) > 0
      ? Number(p.fat_hint)
      : null;
    let mimoBilkovinu = 0;
    let podCilemBilkovin = 0;
    let nadStropemTuku = 0;

    // Jeden retry, a to jen s nedohledanými surovinami v promptu. Slepé
    // opakování nemá smysl — kdo použil cizrnu, použije ji i podruhé.
    //
    // `existujici` roste i o recepty zahozené pro shodu surovin (viz níž) —
    // druhý pokus proto vidí i to, co první pokus zkusil a nevyšlo, ne jen
    // to, co bylo v katalogu už předtím (docs/DALSI_KROK.md 8.6a).
    for (let pokus = 1; pokus <= 2 && zapsanoZPolozky < kusu; pokus += 1) {
      let davka;
      try {
        davka = await generateRecipeBatch(
          openai,
          buildGeneratorInput(
            p,
            povoleneProPolozku,
            existujici.map((e) => e.name_cs),
            kusu - zapsanoZPolozky,
            nedohledane,
            hlavniBilkovina,
            minPodilBilkovin,
            existujiciKombinaceSurovin(existujici),
            maxPodilTuku,
            nedohledaneJednotky,
            nedohledaneTuk,
          ),
        );
      } catch (err) {
        chybaVolani = err;
        chyby.push(`fronta ${p.id}: ${err?.message}`);
        break;
      }
      cenaCelkem += davka.cost_usd;
      nedohledane = [];
      nedohledaneJednotky = [];
      nedohledaneTuk = [];

      for (const r of davka.recepty) {
        if (zapsanoZPolozky >= kusu) break;

        // HINT SE OVĚŘUJE, NESPOLÉHÁ SE NA NĚJ.
        // Bez tohohle by nešlo poznat, jestli rotace zabrala, nebo model jen
        // mlčky vrátil další kuře. Kontroluje se gramáž suroviny, ne název —
        // „Hovězí guláš“ z kuřecích prsou je pořád kuře.
        if (!receptSplnujeBilkovinu(r, hlavniBilkovina)) {
          mimoBilkovinu += 1;
          zahozeno.push({ name_cs: r.name_cs, duvod: 'jina_bilkovina', detail: [hlavniBilkovina] });
          continue;
        }

        const mimo = surovinyMimoSeznam(r, povoleneSet);
        if (mimo.length) {
          zahozeno.push({ name_cs: r.name_cs, duvod: 'surovina_mimo_seznam', detail: mimo });
          nedohledane.push(...mimo);
          continue;
        }

        // TVRDÁ POJISTKA NA JEDNOTKU, vedle pojistky na surovinu výš.
        // docs/DALSI_KROK.md 8.9: jednotka mimo g/ml jde do VLASTNÍHO pole
        // dalšího pokusu (`nedohledaneJednotky` → `tyhle_jednotky_nepouzivej`),
        // nikdy do `nedohledane` — to je jádro celé opravy z 8.9.
        const spatneJednotky = jednotkyMimoSeznam(r);
        if (spatneJednotky.length) {
          zahozeno.push({ name_cs: r.name_cs, duvod: 'jednotka_mimo_seznam', detail: spatneJednotky });
          nedohledaneJednotky.push(...spatneJednotky);
          continue;
        }

        const dup = isDuplicateRecipe(r, existujici);
        if (dup.duplicita) {
          zahozeno.push({ name_cs: r.name_cs, duvod: dup.duvod, proti: dup.proti, skore: dup.skore });
          // Zahozené kvůli shodě surovin se PŘESTO přidá do `existujici`.
          // Model ho vymyslel jednou, bez nové informace ho zkusí znovu —
          // takhle aspoň druhý pokus (a další recepty ve stejné dávce) vidí,
          // že tahle kombinace je (znovu) obsazená, i když se nezapsala.
          existujici = existujici.concat([{ name_cs: r.name_cs, ingredients: r.ingredients }]);
          continue;
        }

        const vysledek = await zapisRecept(r, p, client);
        if (vysledek.ok) {
          zapsano += 1;
          zapsanoZPolozky += 1;
          zbyva -= 1;
          existujici = existujici.concat([{ name_cs: r.name_cs, ingredients: r.ingredients }]);
        } else {
          if (vysledek.duvod === 'pod_cilem_bilkovin') podCilemBilkovin += 1;
          if (vysledek.duvod === 'nad_stropem_tuku') nadStropemTuku += 1;
          zahozeno.push({ name_cs: r.name_cs, duvod: vysledek.duvod, detail: vysledek.detail });
          // VÝHRADNĚ 'nutrice_neuplna' (skutečně neznámá surovina, ze
          // sloupce ingredients_unmatched) smí jít do `nedohledane` a tedy
          // do `tyhle_suroviny_neznam` — docs/DALSI_KROK.md 8.9, jádro
          // celé opravy. `neznama_jednotka` (units_unmatched) sem NEPATŘÍ:
          // je to jednotka, ne surovina, a mísení těch dvou bylo přesně to,
          // proč se model učil zakazovat suroviny, které byly v pořádku
          // (příklad z produkce: "losos" v jednotce "kg"). Ostatní důvody
          // (mimo_kaloricke_pasmo, pod_cilem_bilkovin, insert_selhal,
          // vypocet_nutrice_selhal) taky nejsou názvy surovin, takže sem
          // nikdy nepatřily o nic víc — bílý seznam místo černého to teď
          // hlídá jednou podmínkou pro všechny.
          if (vysledek.duvod === 'nutrice_neuplna' && vysledek.detail?.length) {
            nedohledane.push(...vysledek.detail);
          }
          // docs/DALSI_KROK.md 8.13 — `nad_stropem_tuku` jde do VLASTNÍHO pole
          // dalšího pokusu (`nedohledaneTuk` → `prekroceny_strop_tuku`),
          // stejný vzor jako jednotky z 8.9 o pár řádků výš: není to název
          // suroviny, `tyhle_suroviny_neznam` by ho zbytečně zamlžilo.
          if (vysledek.duvod === 'nad_stropem_tuku' && vysledek.detail?.length) {
            nedohledaneTuk.push(...vysledek.detail);
          }
        }
      }

      await client.from('ai_runs').insert({
        purpose: 'recipe_generation',
        model: RECIPE_GEN_MODEL,
        temperature: RECIPE_GEN_TEMPERATURE,
        prompt_sha256: RECIPE_GEN_PROMPT_SHA256,
        input_tokens: davka.usage.input_tokens,
        output_tokens: davka.usage.output_tokens,
        cost_usd: davka.cost_usd,
        result: {
          queue_id: p.id,
          pokus,
          vraceno: davka.recepty.length,
          zapsano: zapsanoZPolozky,
          hlavni_bilkovina: hlavniBilkovina,
          zahozeno_jina_bilkovina: mimoBilkovinu,
          min_podil_bilkovin: minPodilBilkovin,
          zahozeno_pod_cilem_bilkovin: podCilemBilkovin,
          // `max_podil_tuku` je jen zadání do promptu (8.8). Skutečná tvrdá
          // mez, kterou zapisRecept() validuje, je `validacniStropTuku()`
          // (docs/DALSI_KROK.md 8.13) a může být vyšší — viz
          // zahozeno_nad_stropem_tuku o řádek níž.
          max_podil_tuku: maxPodilTuku,
          zahozeno_nad_stropem_tuku: nadStropemTuku,
        },
      });
    }

    const hotovo = p.vyrobeno + zapsanoZPolozky >= p.pozadovano;
    const infrastruktura = jeInfrastrukturniChyba(chybaVolani);
    await client.from('recipe_generation_queue').update({
      vyrobeno: p.vyrobeno + zapsanoZPolozky,
      // Infrastrukturní chyba vrací položku do fronty, ne do koše — objednávka
      // je v pořádku, jen se nedalo pracovat.
      stav: hotovo
        ? 'done'
        : (zapsanoZPolozky > 0 || infrastruktura ? 'pending' : 'failed'),
      posledni_chyba: zapsanoZPolozky === 0 ? popisChybyBehu(chybaVolani, nedohledane) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', p.id);

    // BĚH SE ZASTAVÍ, NEPROJÍŽDÍ SE ZBYTEK FRONTY.
    //
    // Když došel kredit nebo neplatí klíč, další položka dopadne stejně.
    // Bez tohohle `break` prošlo 17. 8. 2026 jedním během dvacet objednávek,
    // každá dostala razítko chyby a všechny ze stejného důvodu.
    if (infrastruktura) {
      chyby.push(`běh zastaven po infrastrukturní chybě u položky ${p.id}`);
      break;
    }
  }

  return { dry_run: false, zapsano, cena_usd: Number(cenaCelkem.toFixed(6)), zahozeno, chyby };
}

/**
 * Zápis receptu. Nutrice se počítá ZE SUROVIN JEŠTĚ PŘED vložením, takže
 * v katalogu nikdy nevznikne řádek bez čísel — ani na okamžik, ani při pádu
 * procesu uprostřed. (Dřív to bylo dvoufázově a padalo to na kcal NOT NULL.)
 */
async function zapisRecept(r, polozka, client) {
  // Katalog drží kcal NA PORCI a suroviny přepočtené na jednu porci — tak to
  // pro Spoonacular srovnala migrace recovered_spoonacular_scale_to_one_serving
  // a 466 z 516 receptů má servings = 1. Když model přesto vrátí víc porcí,
  // gramáže se podělí, místo aby se recept zahodil: je to deterministický
  // přepočet a zahazovat kvůli němu zaplacené generování nemá smysl.
  const porci = Math.max(1, Math.round(Number(r.servings) || 1));
  const suroviny = porci === 1
    ? r.ingredients
    : (r.ingredients || []).map((i) => ({
      ...i,
      amount: Math.round((Number(i.amount) / porci) * 10) / 10,
    }));

  const { data: nutrice, error: chybaNutrice } = await client
    .rpc('compute_nutrition_for_ingredients', { p_ingredients: suroviny });
  const n = Array.isArray(nutrice) ? nutrice[0] : nutrice;

  if (chybaNutrice) {
    return { ok: false, duvod: 'vypocet_nutrice_selhal', detail: [chybaNutrice.message] };
  }
  if (!n?.complete) {
    // 8.9 (odloženo, viz supabase/migrations/_odlozene/20260903210000...):
    // SQL zatím vrací jen `ingredients_unmatched`, ne `units_unmatched` —
    // rozdělení na duvod 'neznama_jednotka' čeká na tu migraci.
    return { ok: false, duvod: 'nutrice_neuplna', detail: n?.ingredients_unmatched || ['neznámé'] };
  }

  // Kalorické pásmo slotu jako TVRDÁ podmínka, ne přání v promptu.
  //
  // Bez tohohle prošlo do katalogu „Kari z červené čočky" s 1009 kcal do slotu
  // s limitem 700 a svačina se 123 kcal do pásma 150–320. Prompt pásmo zmiňuje,
  // ale model ho nedodrží spolehlivě — a platit za recepty, které stejně
  // zahodíme, nedává smysl. Vrácený důvod jde do promptu při dalším pokusu.
  const kcal = Math.round(Number(n.kcal));
  const min = Number(polozka?.kcal_min) || null;
  const max = Number(polozka?.kcal_max) || null;
  if ((min && kcal < min) || (max && kcal > max)) {
    return {
      ok: false,
      duvod: 'mimo_kaloricke_pasmo',
      detail: [`${kcal} kcal mimo pásmo ${min ?? '?'}–${max ?? '?'} pro slot ${polozka?.meal_type}`],
    };
  }

  // MINIMÁLNÍ PODÍL BÍLKOVIN JAKO TVRDÁ PODMÍNKA, ne přání v promptu.
  //
  // Stejný důvod jako u kalorického pásma o kus výš: objednávka vzniká právě
  // proto, že katalog na ten slot nemá dost bílkovinný recept. Přijmout další,
  // který hint mine, znamená zaplatit za generování a nechat díru otevřenou —
  // a navíc zavřít frontu, protože položka se označí za vyrobenou.
  //
  // Kontroluje se až tady, protože model makra nevrací; podíl jde spočítat
  // teprve z `compute_nutrition_for_ingredients`.
  const minPodil = rozparsujHint(polozka?.protein_hint).podil;
  if (minPodil != null) {
    const kandidat = { kcal, protein_g: Number(n.protein_g) };
    if (!receptSplnujePodil(kandidat, minPodil)) {
      const podil = podilBilkovinReceptu(kandidat);
      return {
        ok: false,
        duvod: 'pod_cilem_bilkovin',
        detail: [
          `${Math.round((podil ?? 0) * 100)} % kalorií z bílkovin, objednávka chtěla aspoň ${Math.round(minPodil * 100)} %`,
        ],
      };
    }
  }

  // TVRDÝ STROP TUKU JAKO VALIDACE, ne jen zadání v promptu —
  // docs/DALSI_KROK.md 8.13. Zrcadlo bílkovinné kontroly výš: 8.8 dala
  // tuku jen prompt (`fat_hint`) a tři měření po sobě ukázala, že to
  // nezabírá (45,0 % → 49,6 % → 47,5 % kalorií z tuku). Bílkovinový hint,
  // který se validuje TVRDĚ, drží 33 % spolehlivě — rozdíl je přesně mezi
  // "kontrolováno" a "jen napsáno do promptu".
  //
  // Strop NENÍ syrové `fat_hint` (výchozí 0,30) — při 0,30 by tahle
  // validace zahodila 86 % dávky (rozložení 110 receptů: do 30 % jen 14 %)
  // a frontu by zabila, přesně to riziko, kvůli kterému 8.8 zůstala jen
  // jako prompt. `validacniStropTuku()` ho zvedne na MIN_TVRDY_STROP_TUKU
  // (0,45), kde propouští 39 % dávky — tlak, ne ucpaná fronta. Utahuje se
  // teprve po nasazení podle `zahozeno_nad_stropem_tuku`.
  const stropTuku = validacniStropTuku(polozka?.fat_hint);
  if (!receptNepresahujeStropTuku({ kcal, fat_g: Number(n.fat_g) }, stropTuku)) {
    const podil = podilTukuReceptu({ kcal, fat_g: Number(n.fat_g) });
    return {
      ok: false,
      duvod: 'nad_stropem_tuku',
      detail: [
        `${Math.round((podil ?? 0) * 100)} % kalorií z tuku, strop je ${Math.round(stropTuku * 100)} %`,
      ],
    };
  }

  const { data: vlozeny, error: chybaVlozeni } = await client
    .from('recipes_catalog')
    .insert({
      name_cs: r.name_cs,
      name_en: r.name_cs,
      meal_type: r.meal_type || polozka.meal_type,
      // Tagy z fronty musí na receptu být — bez nich by veganský recept
      // veganovi nikdy nenabídli. Model může přidat další; bránu v DB
      // stejně projdou jen ty, které sedí se surovinami.
      diet_tags: Array.from(new Set([...(polozka.diet_tags || []), ...(r.diet_tags || [])])),
      servings: 1,
      ingredients: suroviny,
      // POSTUP SE UKLÁDÁ DO OBOU SLOUPCŮ.
      //
      // Model píše česky (prompt je český), ale zapisovalo se jen do
      // `instructions`. Čtecí cesta sahá nejdřív po `instructions_cs`
      // (`instructionLinesFromCatalogRow`, `recipeDetailFromCatalog`), takže
      // 337 vygenerovaných receptů vypadalo jako recepty bez postupu a modal
      // jim dosazoval generické „Připrav suroviny podle seznamu“ — přestože
      // konkrétní postup v databázi celou dobu ležel.
      instructions: r.instructions,
      instructions_cs: r.instructions,
      // kcal je v katalogu integer, makra numeric. Výpočet vrací všechno na
      // jedno desetinné místo, takže se zaokrouhluje jen energie — u maker by
      // se tím zbytečně ztrácela přesnost, kterou sloupec unese.
      kcal,
      protein_g: n.protein_g,
      carbs_g: n.carbs_g,
      fat_g: n.fat_g,
      nutrition_source: 'computed_from_ingredients',
      prep_minutes_estimated: r.active_minutes,
      prep_minutes_passive: r.passive_minutes,
      prep_minutes_source: 'llm',
      source: 'llm_generated',
      // Bez ručního schvalování. Člověk u toho stál prvních pár dávek, aby se
      // ukázalo, co model vrací — teď to rozhodují stroje, protože ruční
      // schvalování je kontrola, která spolehlivě funguje prvních dvacet
      // receptů a pak přestane.
      //
      // Co musí recept splnit, než se aktivuje (a co ho vypne, kdyby ne):
      //   ZDE      nutrice počítaná ze surovin, jinak se nezapíše vůbec
      //   ZDE      kalorické pásmo slotu
      //   trigger  Atwater do 10 %, počet hlavních surovin, český název
      //   trigger  dietní tagy vs. skutečné suroviny
      //   sweeper  totéž denně znovu, takže vada se projeví i zpětně
      pending_review: false,
      active: true,
    })
    .select('id')
    .maybeSingle();

  if (chybaVlozeni || !vlozeny?.id) {
    return { ok: false, duvod: 'insert_selhal', detail: [chybaVlozeni?.message || 'bez id'] };
  }
  return { ok: true, id: vlozeny.id };
}
