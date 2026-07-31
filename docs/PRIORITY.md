# Body & Mind ON — priority podle rizika

> **Nahradil `P0_28_DNI.md` (smazán).** Ten dokument stál na chybném předpokladu, že `generate-plan` používá OpenAI Assistants API a má deadline 26. 8. 2026. **Neplatí.** Ověřeno v kódu: funkce volá Chat Completions přes holý `fetch` s modelem `gpt-4o-mini`. Assistants API se v celém repu nepoužívá nikde. `gpt-4o-mini` není deprecated. **Žádný externí deadline neexistuje** — všechna rizika níže jsou vlastní, bez tikajících hodin.
>
> Jak chyba vznikla (ať se neopakuje): tvrzení bylo odvozeno z **komentáře u tabulky** `ai_generated_plans` („AI generované plány (OpenAI Assistant)"), ne z kódu, a pak předáno konzultantovi jako fakt. Verifikovalo se datum deprecace, ne premisa. **Popisek v databázi není zdroj pravdy o kódu.**

Pořadí níže je podle skutečného rizika a poměru přínos/práce, ne podle data.

---

## 1. Odstranit nabité zbraně v produkci (dnes, ~1 h)

### `github-patch` — smazat
34 řádků, které stáhnou `lib/taskExecutors.js` z GitHub API a vrátí kus textu kolem jednoho řetězce. Jednorázový debugovací nástroj. **Drží `GITHUB_TOKEN` v produkčním prostředí** kvůli ladění, které je dávno hotové.

```bash
supabase functions delete github-patch --project-ref ipfyavvmmxmsjupmfnes
# a odstranit GITHUB_TOKEN ze secrets projektu
```

### `generate-plan` — mrtvý prototyp, ověřit a rozhodnout
Nasazená verze má fallback text `'nactam...'` a `_diagnostics.generation_source: 'openai'`. Podle dat ji nic nepoužívá: všechny plány v `ai_generated_plans` mají `generated_by` = `ai-task:initial_plan`, `admin-regenerate-user-plan` nebo `more-meals-first`, a `nutrition_daily_targets` je u všech NULL, zatímco `daily_calories` a `macros` jsou plné. Reálné generování běží v Next.js appce (`lib/`).

Ta funkce je nebezpečná tím, co by udělala, kdyby ji někdo zavolal: LLM v ní vrací `targets.calories_per_day`, `protein_g`, `carbs_g`, `fat_g` přímo v JSONu a ty hodnoty jdou do databáze **bez jakéhokoli přepočtu nebo kontroly stropů**.

Postup: dohledat, jestli na endpoint funkce něco chodí (Supabase function logs za 30 dní). Pokud ne → smazat. Pokud ano → nejdřív dopsat validační gate (bod 4), pak řešit.

### `users_insert` trigger na `public.users` — shodit
Živý `http_request` POST na `https://hook.eu2.make.com/...`. Dnes nevystřelí (do tabulky nikdo nepíše), ale je to pozůstatek Make éry a odchod dat na externí endpoint při jakémkoli insertu.

```sql
drop trigger if exists users_insert on public.users;
```

---

## 2. Zavřít anonymně volatelné funkce (dnes, ~1 h)

Ověřeno dotazem: **16 `SECURITY DEFINER` funkcí je volatelných rolí `anon`.** `SECURITY DEFINER` běží s právy ownera, tedy **obchází RLS**. A 15 z 16 má `search_path=public` místo prázdného — správně má být `search_path=''` s plně kvalifikovanými názvy, jinak zůstává otevřený search_path hijack.

### Skupina A — ověřeno jako service-role only, revoke je bezpečný

Celá beta e-mailová fronta a import katalogu. Anonym dnes teoreticky může vyčíst seznam beta účastníků, plnit e-mailovou frontu nebo vkládat recepty do katalogu.

Call-sites prověřené: každé `.rpc()` v repu jde přes `supabaseServer` (service-role klient z `lib/supabaseServer.js`, který publishable/anon klíč explicitně odmítá). `lib/supabaseClient.js` s anon klíčem nevolá `.rpc()` ani jednou. `service_role` má vlastní grant, takže revoke od `anon`/`authenticated` se serverových volání nedotkne.

```
list_beta_email_participants      queue_beta_email_message
claim_beta_email_batch            cancel_beta_participant_emails
mark_beta_email_sent              mark_beta_email_failed
mark_beta_email_skipped           patch_beta_participant_milestone
insert_spoonacular_catalog_import_rows
upsert_spoonacular_catalog_import_rows
```

### Skupina B — ověřeno, revoke je bezpečný

Podezření, že tyhle funkce jsou volané anonymně před session, se nepotvrdilo ani u jedné:

```
grant_start_trial_on_signup   ← trigger funkce (RETURNS trigger, BEFORE INSERT na memberships),
                                 PostgREST ji jako RPC nevystavuje; EXECUTE se kontroluje
                                 při CREATE TRIGGER, ne při spuštění → revoke ji nerozbije
validate_beta_invite          ← osiřelá, route smazána v cc6a5a6 „Retire beta registration flow"
claim_beta_invite             ← osiřelá, tamtéž
join_beta_cohort              ← osiřelá, tamtéž
get_beta_participant_for_user ← service-role only (lib/betaParticipantMilestones.js)
insert_product_event_server   ← anonymní eventy jdou přes serverovou route, ne přes anon roli
```

Tři osiřelé funkce po `cc6a5a6` nemají v repu žádný caller kromě generovaných typů a zastaralého `scripts/verify-beta-cohort-ops.mjs`, který volá už neexistující endpointy `/api/beta/join` a `/api/beta/claim-invite`. U nich má smysl `DROP FUNCTION`, ne jen revoke.

**`insert_product_event_server` — uzavřeno.** Signatura (`p_page_path`, `p_utm_source`, `p_utm_medium`, `p_utm_campaign`) vypadala na landing-page tracking z marketingového webu, tedy mimo tento repozitář. Není to tak: `/start` je v tomhle repu (`pages/start.js`, běží na `app.bodyandmindon.cz`), na `bodyandmindon.cz` vrací 404. Těch 393 anonymních eventů se `source='start_page'` proto zapisuje serverová route `pages/api/events.js` přes `supabaseServer` se `service_role`. Klient jen POSTuje na `/api/events` a RPC nevolá přímo nikdy.

**Revoke je tedy bezpečný u všech 16 funkcí.**

```sql
-- call-sites ověřené, jde to po skupinách
revoke execute on function public.list_beta_email_participants(...) from anon;
-- fixní search_path u VŠECH SECURITY DEFINER funkcí
alter function public.nazev(...) set search_path = '';
```

**Po revoke ověřit empiricky, ne jen grepem.** Otevřít `https://app.bodyandmindon.cz/start` v anonymním okně a zkontrolovat, že v `product_events` přibyl nový řádek se `source='start_page'`. Když nepřibude, revoke zasáhl cestu, kterou statická analýza nenašla — vrátit grant a hledat dál.

---

## 3. Záloha a odolnost (dnes)

`pg_dump` do offline souboru u sebe na disku. Na Free plánu nejsou stažitelné zálohy — tohle je jediná pojistka. **Přidat `backups/` do `.gitignore` PŘED prvním dumpem** — dumpy obsahují zdravotní data a v git historii by zůstala natrvalo.

CI/CD pro edge funkce (GitHub Actions, `supabase functions deploy`, deploy jen změněných funkcí, tag na každý release). Supabase nemá rollback — rollback = redeploy tagu.

Doplnit `deno.lock` a pinovat `jsr:@supabase/functions-js/edge-runtime.d.ts` (dnes bez jakéhokoli constraintu) a `jsr:@supabase/supabase-js@2` (major range, minor plave). Bez lockfilu není build reprodukovatelný.

Vyškrtnout mrtvou env proměnnou `OPENAI_ASSISTANT_ID` ze `scripts/verify-env-required.mjs:31` — nikde se nečte.

**Supabase Pro ($25/měs)** zůstává doporučení, ne P0: řeší pausing a 7denní zálohy. Rozhodnutí zůstat na Free je vědomě přijaté riziko do první reálné platby.

---

## 4. Validační gate jako prevence (tento týden)

Aktivní generovací cesta v `lib/` **počítá čísla správně** — ověřeno na devíti aktivních plánech: `daily_calories` odpovídá `body_metrics.calories_target` z registrace a makra jsou aritmeticky konzistentní s kalorickým cílem na 1–2 kcal. To není chování LLM, které si čísla vymýšlí. Nejnižší cíl (1464 kcal, žena 63 kg/160 cm, redukce) je na 1,26× odhadovaného BMR, tedy nad ženským minimem 1200 i nad hranicí 0,8× BMR.

Gate tedy není náprava, ale **pojistka proti regresi** — aby žádná budoucí změna promptu ani žádná jiná cesta (např. ten prototyp) nemohla poslat nevalidovaná čísla uživateli.

```ts
const SAFETY = {
  minKcalFemale: 1200, minKcalMale: 1500,
  minKcalRelativeBMR: 0.8, maxDeficitPct: 0.25,
  maxWeeklyLossPctBW: 0.01,
  minFatGPerKg: 0.8, maxProteinGPerKg: 2.5,
  blockIfBmiBelow: 18.5,
};
```

Gate ověří: kcal ≥ stropy, makra × jejich kalorická hodnota = cílové kcal (±2 %), tuk ≥ 0,8 g/kg, bílkoviny ≤ 2,5 g/kg, každý `recipe_id` existuje v katalogu a je `active`, restrikce 0 porušení. Fail → repair (max 2×) → fail → **nedoručit** + log.

Dvě konkrétní věci k dohledání, které z kontroly dat vypadly:
- **Tuk 0,73 g/kg** u redukčního plánu ženy 63 kg (46 g) — mírně pod doporučeným minimem 0,8 g/kg.
- **+100 kcal anomálie**: ve třech z devíti plánů je `daily_calories` přesně o 100 výš než registrační cíl, a to napříč cíli (udržování, nabírání i redukce). Vypadá na záměrné pravidlo v kódu — dohledat kde a proč, nebo odstranit.

---

## 5. Obsahové blockery (paralelně, je to práce na obsahu, ne na kódu)

Ověřeno dotazy. Nejde to obejít promptem ani architekturou.

**Recepty** — 505 celkem, **všech 505 má kompletní nutrici** (kcal, B/S/T), český název, český postup i ingredience. Struktura je dobrá, makra jsou předpočítaná na receptu. Ale:

| Problém | Čísla |
|---|---|
| Neaktivních receptů | **207 z 505 (41 %)** — jen 298 je `active` |
| Bez dietních tagů | **231 z 505 (46 %)** — nejdou filtrovat pro vegana/alergie |
| Použitelné svačiny | **32** (oběd 123, snídaně 83, večeře 60) |

Svačin je tak málo, že při jedné denně uživatel vyčerpá celý katalog za měsíc. Diversity metrika ≥ 0,7 v 7denním plánu na svačinách a večeřích neprojde — kvůli obsahu, ne kvůli modelu. A recept bez dietních tagů musíš buď vyloučit z kandidátního setu (a přijít o polovinu katalogu), nebo riskovat, že veganovi navrhneš kuřecí.

**Cvičení** — 41 celkem, 9 partií, 6 typů vybavení, jen 27 s vizuálem:

```
horní nohy 11 · hrudník 6 · záda 5 · paže 5 · břicho 5
ramena 3 · kardio 3 · lýtka 1 · celé tělo 1 · bez zařazení 1
```

Se třemi cviky na ramena a jedním na lýtka nepostavíš tříměsíční plán s progresí. Potřeba řádově 150+ s tagy (partie, vybavení, obtížnost, náhrady).

---

## 6. RLS výkon a hygiena (tento týden, mechanické)

- **31 politik** přepsat z `auth.uid()` na `(select auth.uid())` — InitPlan, jedno vyhodnocení místo per-row. Supabase dokumentuje případ 11 000 ms → 10 ms.
- Doplnit `TO authenticated` u politik, kde chybí.
- Smazat 3 duplicitní indexy, doplnit index na 6 cizích klíčů bez indexu.
- Zkonsolidovat 12 duplicitních permissive politik na `users` (odpadne s dropem tabulky).
- Drop 9 tabulek `_backup_2026_06_02_*` (všechny 0 řádků).

**Migrace `supabase/migrations/20260729180000_performance_cleanup.sql` existuje, ale vyžaduje revizi před nasazením.** Není to hotová věc k odeslání: šest `ALTER POLICY`, jeden `DROP POLICY` a jeden `CREATE INDEX` v ní míří na tabulky, které jsou prázdné a mrtvé a ve fázi 1 se stejně dropnou — `users` (2 politiky + dropovaná `"Users can view own data"`), `subscriptions`, `fitness_goals`, `nutrition_logs`, `progress_tracking` a index na `fitness_goals.user_id`. Přepisovat RLS politiky na tabulkách, které za týden zmizí, je práce nazmar a v migrační historii šum. Buď migraci sloučit s dropem těch tabulek do jedné, nebo z ní ty řádky vyndat a nechat je zmizet s tabulkami. Zbytek migrace (24 politik na živých tabulkách, 3 duplicitní indexy, 5 FK indexů, `search_path` u 8 funkcí, drop záloh) je v pořádku.

Devátou funkci `enforce_recipe_catalog_rules` migrace záměrně vynechává — její definice v repu není (drift oproti produkci), takže nelze ověřit, že nepoužívá nekvalifikované názvy. Před opravou `search_path` u ní je potřeba stáhnout `pg_get_functiondef` z produkce a dostat ji do migrace.

---

## 7. Až potom: strukturální práce

Fáze 1–8 v `ARCHITEKTURA.md` (redukce schématu 90 → ~50, identita a FK na `auth.users`, `timestamptz`, entitlementy, kanonická měření, orchestrace, role trenéra, TED). Ta sekvence platí — mění se jen to, že jí nepředchází žádný externí deadline, takže se dá dělat v klidu a v pořadí podle rizika.

Jediné, co z ní má smysl posunout dopředu: **`trigger-scheduler`** je dnes jen smyčka `fetch` na `https://app.bodyandmindon.cz/api/ai/run-scheduler` s `CRON_SECRET` a parametry `runs`/`delay` (8 s mezi běhy). Skutečná logika schedulingu je v Next.js appce. Nahradit tu smyčku Supabase Cronem je proto malá, izolovaná změna s okamžitým přínosem (historie běhů v `cron.job_run_details`, žádná vlastní smyčka, která se může tiše zaseknout).

Zároveň dobrá zpráva pro budoucí migraci: `lib/runAgent.js:146` **už používá `openai.responses.create`**, tedy Responses API. Cílový stav je částečně hotový.
