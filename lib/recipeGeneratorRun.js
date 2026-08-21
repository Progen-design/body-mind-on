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
  generateRecipeBatch,
  isDuplicateRecipe,
  isRecipeGenEnabled,
  maxPerRun,
  maxPerDay,
  nactiPovoleneSuroviny,
  surovinyProDietu,
  normalizeRecipeName,
  surovinyMimoSeznam,
  vyrobenoZa24h,
} from './recipeGenerator.js';
import { nactiFrontu } from './recipeGenerationQueue.js';
import { bilkovinaProPolozku, receptSplnujeBilkovinu } from './plan/rotaceBilkovin.js';
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
 * @param {{ dryRun?: boolean, limit?: number, queueId?: number|null, client?: any, openai?: OpenAI }} [opts]
 */
export async function runRecipeGenerator(opts = {}) {
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
        vstup_pro_model: buildGeneratorInput(p, proPolozku(p).nazvy, existujici.map((e) => e.name_cs), kusu),
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
    let zapsanoZPolozky = 0;
    let chybaVolani = null;
    const { nazvy: povoleneProPolozku, set: povoleneSet } = proPolozku(p);
    const hlavniBilkovina = bilkovinaProPolozku(p, existujici, povoleneProPolozku);
    let mimoBilkovinu = 0;

    // Jeden retry, a to jen s nedohledanými surovinami v promptu. Slepé
    // opakování nemá smysl — kdo použil cizrnu, použije ji i podruhé.
    for (let pokus = 1; pokus <= 2 && zapsanoZPolozky < kusu; pokus += 1) {
      let davka;
      try {
        davka = await generateRecipeBatch(
          openai,
          buildGeneratorInput(p, povoleneProPolozku, existujici.map((e) => e.name_cs), kusu - zapsanoZPolozky, nedohledane, hlavniBilkovina),
        );
      } catch (err) {
        chybaVolani = err;
        chyby.push(`fronta ${p.id}: ${err?.message}`);
        break;
      }
      cenaCelkem += davka.cost_usd;
      nedohledane = [];

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

        const dup = isDuplicateRecipe(r, existujici);
        if (dup.duplicita) {
          zahozeno.push({ name_cs: r.name_cs, duvod: dup.duvod, proti: dup.proti, skore: dup.skore });
          continue;
        }

        const vysledek = await zapisRecept(r, p, client);
        if (vysledek.ok) {
          zapsano += 1;
          zapsanoZPolozky += 1;
          zbyva -= 1;
          existujici = existujici.concat([{ name_cs: r.name_cs, ingredients: r.ingredients }]);
        } else {
          zahozeno.push({ name_cs: r.name_cs, duvod: vysledek.duvod, detail: vysledek.detail });
          if (vysledek.detail?.length) nedohledane.push(...vysledek.detail);
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
