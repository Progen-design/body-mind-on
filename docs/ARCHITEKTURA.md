# Body & Mind ON — cílová architektura (v3)

> **Verze 3, 30. 7. 2026.** Nahrazuje v2. **Opravuje chybnou premisu o OpenAI Assistants API, na které v2 stála:** `generate-plan` na Assistants API nestojí, Assistants API se v repu nepoužívá nikde a žádný deadline 26. 8. 2026 neexistuje. Ověřeno ve staženém zdrojáku nasazené funkce. Rozbor včetně toho, jak chyba vznikla, je v sekci 8, bod 5.
>
> v2 vznikla po nezávislé revizi třemi specialisty (durable execution, Postgres/Supabase, produkční LLM systémy) a opravila čtyři konkrétní chyby ve v1. Ty jsou spolu s vlastní chybou v2 vypsané v sekci 8, protože stejné chyby se snadno udělají znovu.
>
> **Operativní dokument je [`PRIORITY.md`](PRIORITY.md).** Tenhle dokument popisuje cílový stav; `PRIORITY.md` říká, co dělat teď a v jakém pořadí podle rizika. **Žádný externí deadline neexistuje** — všechna rizika jsou vlastní, bez tikajících hodin.

---

## 1. Východiska

Systém je v testovacím provozu: 11 uživatelů v `auth.users`, Stripe v sandboxu, žádné reálné platby, Supabase Free plán. **Breaking changes jsou proto teď téměř zdarma a za šest měsíců budou drahé.** Vše, co je breaking, patří do nejbližších týdnů.

Zásadní zjištění, které rámuje celý dokument: **schéma má ~90 tabulek, ale produkt reálně používá ~10.** Není to špatně navržené schéma — je to archeologie tří generací návrhu naskládaných do jednoho `public`. Nic nikdy nezemřelo. Důsledek je, že každé další rozhodnutí děláš proti nejasnému stavu. Redukce schématu proto není kosmetika, je to obnovení schopnosti rozhodovat.

---

## 2. Cílová topologie

```
KLIENT (Next.js, Vercel)
  └── čte přes RLS, píše jen svoje data
      žádná privilegovaná operace, žádné anon RPC

APLIKAČNÍ VRSTVA
  ├── Next.js route handlers na Vercelu
  │     • TED chat (streaming) — čekání na OpenAI se nepočítá do CPU time
  │     • synchronní CRUD
  ├── Vercel Workflows (durable execution)
  │     • generování plánů, Autopilot, lifecycle e-maily
  │     • dlouhé LLM operace v idempotentních krocích
  └── Supabase Edge Functions
        • JEN webhooky a batch: apple-health-ingest, Stripe webhook,
          noční extrakce paměti, rekonciliace
        • žádná dlouhá LLM operace (150 s wall clock, 2 s CPU na Free)

BUDÍK
  └── Supabase Cron (pg_cron) → HTTP → Vercel Workflow
      (Vercel Cron na Hobby umí jen 1×/den s přesností ±59 min — nestačí)

DATOVÁ VRSTVA (Postgres)
  ├── public   — vše, co čte klient přes PostgREST
  └── private  — raw payloady, audit, staging; NIKDY neexponované,
                 bez grantu pro anon/authenticated
```

---

## 3. Identita a autorizace

### 3.1 Jediný FK na `auth.users` má `profiles`

```
auth.users (Supabase Auth, zdroj pravdy)
    ↑ 1:1, ON DELETE CASCADE
public.profiles (id = auth.users.id)
    ↑ N:1, ON DELETE CASCADE  ← všechny doménové tabulky sem
public.measurements, habit_logs, ai_generated_plans, memberships, ...
```

Doménové tabulky míří na `profiles`, ne na `auth.users`. Důvod je praktický a v dokumentaci ho nenajdeš: **PostgREST neumí embedovat `auth.users`**, protože `auth` schéma není (a nemá být) exponované. S FK na `auth.users` nikdy nenapíšeš `select('*, profiles(name)')` s automatickou detekcí vztahu. Zároveň Supabase varuje, že `auth` schéma se může změnit — tak ať se rozbije jedno místo, ne třicet.

**`user_id` musí být `NOT NULL` + index.** Volný nullable `user_id` znamená, že jediný bug v insertu vytvoří řádek, který nikdo nikdy neuvidí (RLS `user_id = auth.uid()` na NULL nematchne) a nikdy se nesmaže. Index je povinný i proto, že bez něj dělá cascade delete seq scan na každé child tabulce.

### 3.2 GDPR: kaskáda ano, ale ne na účetnictví

Nejčastější chyba v tomto typu produktu:

- **Zdravotní data** (měření, jídelníčky, check-iny, fotky, AI plány) → `ON DELETE CASCADE`. To je čl. 17 GDPR a zvláštní kategorie dle čl. 9 → minimalizace.
- **Účetní a daňové doklady** → **NESMÍ kaskádovat.** V ČR je zákonná retence: účetní záznamy 5 let, daňové doklady 10 let. To je právní titul dle čl. 6(1)(c), který přebíjí právo na výmaz. Řešení: `ON DELETE SET NULL` + denormalizovaný snapshot fakturačních údajů v samotném dokladu, a pseudonymizace až po vypršení lhůty.
- **Grace period**: `profiles.deleted_at` (soft delete), přístup se odebere hned, hard delete cronem po 30 dnech. Okamžitý hard delete tě jednou spálí.

### 3.3 Role trenéra — tabulka vazeb, nikdy JWT claim

Web má sekci „Pro trenéry", tedy existuje druhá persona s přístupem k cizím zdravotním datům. To je autorizační problém, který v1 vůbec neřešila.

```sql
create type app_role as enum ('client','trainer','admin');
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role    app_role not null,
  primary key (user_id, role)
);

create type coach_link_status as enum ('pending','active','revoked');
create table public.coach_clients (
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  client_id   uuid not null references public.profiles(id) on delete cascade,
  status      coach_link_status not null default 'pending',
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,        -- ★ souhlas KLIENTA, ne rozhodnutí trenéra
  revoked_at  timestamptz,
  primary key (coach_id, client_id),
  check (coach_id <> client_id)
);
create index coach_clients_lookup_idx on public.coach_clients (coach_id, status) include (client_id);
```

**`accepted_at` je právně podstatné.** Vazba nesmí vzniknout tím, že trenér přidá e-mail — klient musí akceptovat. `status='active'` jen když `accepted_at is not null`. Bez toho trenér zadá cizí e-mail a čte cizí zdravotní data.

**Seznam klientů nikdy do JWT claimu.** Claim je stale až do refreshe tokenu (default 1 h). Klient odebere souhlas → trenér má hodinu přístup ke zdravotním datům. Nepřijatelné. JWT claim smí nést jen hrubou roli (`client`/`trainer`/`admin`), která se mění zřídka; seznam klientů je vždy live dotaz v RLS.

**A neřeš to service_role klíčem v „trainer API route".** Je to o 20 minut rychlejší a pak jediná chybějící podmínka ve `where` znamená leak zdravotních dat všech uživatelů.

```sql
create or replace function public.accessible_user_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select auth.uid()
  union
  select cc.client_id from public.coach_clients cc
   where cc.coach_id = auth.uid() and cc.status = 'active';
$$;
revoke execute on function public.accessible_user_ids() from anon, public;
grant execute on function public.accessible_user_ids() to authenticated;

-- čtení: vlastní + klienti; zápis: JEN vlastní
create policy measurements_read on public.measurements
  for select to authenticated
  using ( user_id in (select public.accessible_user_ids()) );

create policy measurements_write_own on public.measurements
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );
```

Čtyři pravidla výkonu RLS, která se sčítají: `(select auth.uid())` wrapper (InitPlan → jedno vyhodnocení místo per-row), filtrovat `user_id in (select ...)` proti fixní množině místo korelovaně, index na `user_id`, a vždy `TO authenticated` (anon se odmítne v plánovači). Plus filtruj i na klientovi (`.eq('user_id', id)`), aby planner nespoléhal na politiku pro selektivitu.

---

## 4. Entitlementy — tři vrstvy

```
Vrstva 1  BILLING MIRROR  private.stripe_events — co se stalo ve Stripe
Vrstva 2  ENTITLEMENT     memberships — co uživatel SMÍ (jediné, co appka čte)
Vrstva 3  ROLES           user_roles — kdo uživatel JE (ortogonální)
```

**Klíčové pravidlo: appka nikdy nečte Stripe stav. Čte jen vrstvu 2, přes jednu funkci.**

`subscriptions` se zahodí. Není to „Stripe-shaped cílový model", jak tvrdila v1 — je to legacy tabulka s **chybným mapováním**: `cancel_at_period_end` je v ní `timestamp`, ale ve Stripe API je to `boolean` (časový údaj je `cancel_at`). Tabulka, která se tváří jako správná odpověď a tiše by rozbila cancellation flow.

`memberships` zůstává jádrem (má data, webhook do ní píše), ale rozšiřuje se, protože dnes míchá billing mirror s entitlementem a neumí vyjádřit „přístup má, ale ne ze Stripe":

```sql
create type entitlement_source as enum ('stripe','trial','beta','manual','staff');
create type plan_code as enum ('free','start','on_club','vip');

create table public.plans (
  code plan_code primary key,
  rank smallint not null unique,   -- ★ umožní porovnání `rank >= x`
  label text not null,
  price_amount integer, currency text default 'CZK'
);

alter table public.memberships
  add column source        entitlement_source not null default 'stripe',
  add column plan          plan_code,
  add column access_until  timestamptz,      -- ★ jediné pole, které gate čte
  add column grace_until   timestamptz,
  add column last_event_id text,
  add column last_event_at timestamptz;      -- ochrana proti out-of-order eventům
```

**12týdenní program není tier.** Je to jednorázový produkt a uživatel ho může mít *zároveň* s ON CLUB. Nacpat ho do `tier` enumu je chyba na rok odmotávání:

```sql
create table public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  program_code text not null,            -- '12_week'
  starts_on date not null, ends_on date not null,
  source entitlement_source not null default 'stripe',
  stripe_payment_intent_id text unique
);
```

**Jeden gate pro celou aplikaci:**

```sql
create or replace function public.has_access(check_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
    where m.user_id = check_user
      and coalesce(m.grace_until, m.access_until) > now());
$$;
```

**Trial nepiš sám** — Stripe `trial_period_days` na Price, status `trialing`, event `customer.subscription.trial_will_end` (3 dny předem) jako trigger pro e-mail.

**Grace period:** přístup ANO při `trialing`, `active`, `past_due` (+ `grace_until = now() + 7 days` a e-mail o kartě); NE při `canceled`, `unpaid`, `incomplete_expired`, `paused`. Ve Stripe zapni Smart Retries a „cancel after all retries fail" — Stripe pak sám překlopí `past_due → canceled` a nemusíš držet vlastní scheduler.

**Čtyři mechanismy proti rozejití se Stripe — všechny potřebuješ:**

1. **Idempotence**: `insert into private.stripe_events(id, ...) on conflict (id) do nothing`. Když `RETURNING` nevrátí řádek, event byl zpracovaný → skip. Stripe doručuje at-least-once.
2. **Nevěř payloadu, refetchuj.** Webhook je jen *signál*. Vezmi z něj `customer` ID a tahni aktuální stav z API, ten zapiš. Tím jsi imunní proti out-of-order doručení — nejčastější příčině „zaplatil a nemá přístup", kdy starý event přijde po novém a přepíše ho.
3. **Ordering guard**: `where last_event_at is null or last_event_at < :event_created`.
4. **Noční rekonciliace** cronem: projdi `stripe_customer_id`, přepiš `memberships` podle API, loguj diffy. Bez toho se dřív nebo později rozejdeš a nedozvíš se to.

**Guard, který dnes chybí:** Stripe webhook nesmí přepsat řádek, kde `source <> 'stripe'`. Jinak betatester ztratí přístup, protože webhook přepsal jeho řádku.

Stripe Entitlements API ani Stripe Sync Engine teď ne — první je overkill pro 4 tiery a nepokryje beta ani trenéra, druhý řeší reporting, ne entitlement gate. Oba jdou přidat později *vedle* vrstvy 2.

---

## 5. Zdravotní data — bronze / silver / gold

**Oprava proti v1:** negeneralizuj `body_measurements`, generalizuj `apple_health_metrics`. Ta tabulka (5035 řádků, 45 metric defs, long format s metadaty) je nejlepší návrh v celém schématu a je jen uvězněný pod prefixem jednoho vendora. `body_measurements` je prázdná a duplikuje ji.

```
BRONZE  private.ingest_raw       raw payloady, unique(provider, provider_event_id),
                                 retence 90 dní
SILVER  public.measurements      kanonická append-only long-format časová řada
                                 unique(user_id, metric_code, source, source_record_id)
GOLD    public.daily_metrics     view: jedna hodnota na den podle precedence zdroje
```

```sql
create table public.measurements (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  metric_code text not null references public.metric_defs(code),
  measured_at timestamptz not null,
  value numeric not null,
  unit text not null,
  source text not null,            -- 'withings','apple_health','manual','coach'
  source_device text,
  source_record_id text,
  raw_id bigint references private.ingest_raw(id) on delete set null,
  unique (user_id, metric_code, source, source_record_id)
);
create index on public.measurements (user_id, metric_code, measured_at desc);
```

**Konflikt dvou vážení v jeden den není konflikt k mazání.** Silver uchová obě, gold vybere jednu podle deterministické precedence (`metric_source_priority`: chytrá váha > ruční > telefon). Tak to řeší i produkční systémy.

```sql
create or replace view public.daily_metrics as
select distinct on (m.user_id, m.metric_code, (m.measured_at at time zone 'Europe/Prague')::date)
       m.user_id, m.metric_code,
       (m.measured_at at time zone 'Europe/Prague')::date as day,
       m.value, m.unit, m.source as chosen_source, m.measured_at
  from public.measurements m
  left join public.metric_source_priority p
         on p.metric_code = m.metric_code and p.source = m.source
 where m.dup_of is null
 order by m.user_id, m.metric_code,
          (m.measured_at at time zone 'Europe/Prague')::date,
          coalesce(p.priority, 999), m.measured_at desc;
```

`at time zone 'Europe/Prague'` je tam záměrně: „váha z 1. února" musí být lokální den uživatele. Bez toho měření ve 23:30 CET spadne do dalšího dne — klasický bug fitness aplikací.

**Obyčejný view, ne materialized.** Materialized na Supabase nedědí RLS, potřebuje `REFRESH` cronem a při `CONCURRENTLY` unique index — tři místa, kde se to tiše rozejde. Práh pro MV: ~1–2 M řádků v `measurements` nebo když dotaz překročí ~200 ms.

**Past, kterou precedence nevyřeší: Withings se propisuje do Apple Health.** Uživatel s oběma integracemi pošle stejné měření dvakrát z dvou zdrojů. Graf bude OK, ale „počet vážení za měsíc" a AI kontext budou zdvojené. Řešení: na ingestu filtruj podle HealthKit `sourceRevision.source.bundleIdentifier` (`com.withings.*` + aktivní direct integrace → zahoď), plus fuzzy fallback `dup_of` (±3 min, ±50 g).

**Retence raw:** 90 dní hot v `private.ingest_raw`, pak delete nebo gzip JSONL do Storage. Nastav to **teď**, dokud je to 107 řádků — při 1000 uživatelích ti to sežere Free limit 500 MB za pár týdnů.

**Rozřezání `body_metrics`** (10 řádků, triviální migrace): identita → `profiles`; `height_cm`/`weight_kg` → `measurements`; **`bmi` a `tdee` nikam** — jsou to čisté funkce jiných hodnot, ukládat je znamená garantovat drift; preference → `user_preferences`; cíle → `user_goals` (časová řada, cíle se mění).

**`workouts` (plán) vs `apple_health_workouts` (fakt):** propojení soft matchem v aplikační vrstvě (stejný den ± tolerance, typ aktivity), nikdy hard FK. A vždy nech uživateli potvrdit ručně — automatický match bude mít false negatives a nic nenaštve víc než „splněno: ne", když cvičil.

---

## 6. AI vrstva — z 15 tabulek na 6

**Kritérium, které v1 chybělo.** Rozhodovací osa není počet úloh, ale kdo edituje prompty:

| Situace | Kde má konfigurace žít |
|---|---|
| < 8 typů úloh, prompty mění jen vývojář | čistě kód, typované TS moduly |
| 8–25 typů, stále jen vývojář | kód + 1 runtime tabulka na běhy |
| 25+ typů **a** ne-technický editor **a** A/B testy za běhu | teprve tady DB-driven registry |

Projekt je v pásmu 1–2 (12 typů úloh, jeden vývojář). **DB-driven konfigurace aktivně škodí:** žádný diff, žádné review, žádný atomický rollback, žádná typová kontrola. Čtyři tabulky mají 0 řádků, `ai_config` má 1 řádek a `ai_agent_settings` 2 — to nejsou tabulky, to jsou konstanty s SQL overheadem.

**Do kódu** (`lib/ai/registry.ts`): `ai_agents`, `ai_agent_settings`, `ai_agent_tools`, `ai_config`, `ai_task_types`, `ai_context_profiles`, `ai_executor_bindings`.
**Zahodit**: `ai_agent_versions`, `ai_content_drafts`, `ai_supporting_documents`.
**Sloučit**: `ai_tasks` + `ai_logs` + `ai_events` → `ai_runs` (1 řádek = 1 LLM operace, s `trace_id`, `prompt_sha`, tokeny, cost, latence, `guardrail_tripped`) + `ai_run_events`.
**Nechat**: `ai_messages`, `user_ai_memory`, `openai_daily_usage` (jako view nad `ai_runs`), `openai_response_cache`, `ai_generated_plans`.
**`ai_trigger_rules` + `trigger-scheduler`** → Supabase Cron + deklarace v kódu.

**Prompty do gitu**, ne do DB. Nejsilnější argument nepřichází z teorie: OpenAI ruší `v1/prompts` k 30. 11. 2026 s doporučením „move reusable prompt content into your application code". Build step načte `prompts/*.md`, spočítá SHA-256, vygeneruje typovaný modul; `ai_runs` ukládá `prompt_key`, `prompt_version`, `prompt_sha` → plná dohledatelnost bez konfigurační tabulky.

**Zkontroluj hit rate `openai_response_cache`.** U personalizovaných plánů bude blízko nule — dva uživatelé nedostanou stejný prompt. Pro opakující se prefixy je lepší prompt caching od OpenAI (90 % dolů, nulová práce). Pod 10 % hit rate je tabulka jen režie.

### 6.1 TED — paměť a kontext

**pgvector zatím ne.** Dokud se paměť jednoho uživatele vejde do ~1500 tokenů (~60–80 faktů), posílej ji celou — retrieval, který může vynechat relevantní fakt, je horší než 1500 tokenů za $0.001. Při 10 řádcích je vector search čistá režie. Strukturovanou paměť měj ale vždy, i po zapnutí vektorů: vector search je slepý k relacím a nevrátí ti spolehlivě „má problém s koleny", když se ptáš na trénink nohou.

**Kritická vada dnešního `user_ai_memory`: chybí čas.** Nejčastější failure mode paměťových systémů je staleness — TED bude za tři měsíce tvrdit „tvým cílem je zhubnout 5 kg", když uživatel dva měsíce nabírá. Řešení je bitemporální model:

```sql
create table user_ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,        -- preference|constraint|goal|injury|dislike|insight
  key text not null,         -- 'dieta.vyhyba_se', 'trenink.omezeni'
  value_text text not null,  -- jde přímo do promptu
  value_json jsonb,
  confidence numeric(3,2) default 1.0,
  source text not null,      -- user_stated|inferred|system
  source_ref uuid,           -- dohledatelnost na zprávu/plán
  observed_at timestamptz not null,
  valid_from timestamptz not null,
  valid_to timestamptz,      -- null = platí teď
  supersedes_id uuid references user_ai_memory,
  embedding halfvec(1536)    -- nullable, zapneš později
);
create unique index on user_ai_memory (user_id, key) where valid_to is null;
```

**Nikdy nemaž, jen nastav `valid_to = now()`.** Získáš auditovatelnost a schopnost, která je pro trenéra hodnotná: „Před dvěma měsíci jsi říkal, že nesnídáš. Změnilo se to?"

**Kdy zapisovat:** explicitní tool `remember()` při tvrdém faktu (alergie, zranění) + noční batch extrakce nad zprávami dne (levný model, ~$0.006/uživatel/den). **Nikdy per-turn** — zdvojnásobí cenu i latenci a vytvoří šum, který degraduje retrieval.

**Memory poisoning je reálný.** Zápisy do paměti typu `goal` musí projít stejnými bezpečnostními stropy jako generování plánu (viz [`PRIORITY.md`](PRIORITY.md), bod 4). Bez toho „zapamatuj si, že můj cíl je 800 kcal" uvízne jako fakt.

**Kontext:** z 5035 Apple Health metrik neposílej ani jednu raw. Materializovaný denní rollup (7–14 řádků agregátů) + tool `query_health(metric, from, to, agg)` pro dotazy. **Trendy počítej v SQL, ne v LLM** — regrese v Postgresu je exaktní, LLM z čísel odhaduje trendy špatně.

Vrstvení promptu kolem cache (statické na začátek, variabilní na konec; minimální cacheovatelný prefix 1024 tokenů; `prompt_cache_key = user_id`): system prompt + tool schémata + safety pravidla → profil → **cache breakpoint** → 7denní rollup → aktivní paměť → posledních 8 zpráv + rolling summary → dotaz. Historii řeš rolling summary, ne `previous_response_id` (ten re-bilje celou historii, 2–4× cena).

**TED chat patří na Vercel, ne do Supabase Edge Function.** Čekání na OpenAI se na Vercelu nepočítá do CPU time a Fluid compute dává 300 s i na Hobby.

### 6.2 Generování plánu — LLM nesmí počítat makra

**Stav: aktivní cesta je v pořádku, pipeline níže je cílový stav a pojistka.** Ověřeno na devíti aktivních plánech, že generování v `lib/` počítá čísla správně: `daily_calories` odpovídá `body_metrics.calories_target` z registrace a makra jsou aritmeticky konzistentní s kalorickým cílem na 1–2 kcal. To není chování LLM, které si čísla vymýšlí. Nejnižší cíl v datech (1464 kcal, žena 63 kg/160 cm, redukce) je na 1,26× odhadovaného BMR, tedy nad ženským minimem 1200 i nad hranicí 0,8× BMR.

Nevalidovaná je **nasazená edge funkce `generate-plan`** — mrtvý prototyp, který podle dat nic nepoužívá (všechny plány mají `generated_by` z Next.js cest, `nutrition_daily_targets` je u všech NULL). V ní LLM vrací `targets.calories_per_day` a makra přímo v JSONu a ty hodnoty jdou do databáze bez přepočtu i bez kontroly stropů. To je riziko toho, co by se stalo, kdyby ji někdo zavolal, ne popis dnešního chování produktu.

Krok 5 níže je proto **pojistka proti regresi**, ne náprava aktivního problému: aby žádná budoucí změna promptu ani žádná jiná cesta nemohla poslat nevalidovaná čísla uživateli.

Šestikrokový pipeline. LLM vstupuje dvakrát a ani jednou se nedotkne čísla:

1. **KÓD** — cíle: TDEE (Mifflin-St Jeor × aktivita), deficit se stropy, rozdělení maker. Unit testy.
2. **KÓD** — filtr katalogu: z 505 receptů podle diety, alergenů, vyhýbaných potravin → 80–150 kandidátů.
3. **LLM** — výběr a struktura: vybere `recipe_id` do slotů podle vkusu, rozmanitosti, návaznosti (zbytky), sezónnosti. **Výstup obsahuje jen `recipe_id`, `slot`, `portion_hint`. Žádné nutriční číslo od LLM neprojde.**
4. **KÓD** — optimalizace porcí: měkké odchylkové proměnné od cílů, minimalizuj váženou sumu. Baseline: iterativní scaling + swap, ~200 řádků TS. Scale: `highs-js` / `glpk.js` (WASM, běží i v Denu) s MIGP formulací — pod 100 ms a 100% feasibility, proti 48 % u hard constraints.
5. **KÓD** — validace jako hard gate: přepočítej z `ingredients_nutrition`, ne z toho, co tvrdí LLM. kcal ±5 %, makra ±10 %, restrikce 0 porušení, kcal ≥ floor. Fail → repair (max 2×) → fail → **nedoručuj**, fallback na poslední validní plán.
6. **LLM** — text: vysvětlení a motivace nad **už zvalidovanými** čísly. Nesmí čísla měnit.

**Autopilot musí být deterministický rozhodovací strom**, LLM změnu jen vysvětlí:

```
změna váhy vs. cíl mimo pásmo  → uprav kcal o ±100–150 (max 1 změna/týden)
adherence návyků < 60 %        → NEZVYŠUJ obtížnost, sniž bariéru
spánek < 6 h ve 4+ nocích      → sniž tréninkový objem o 20 %
2 týdny bez dat                → žádná změna, pošli check-in
kterákoli změna                → projdi bezpečnostní stropy
```

Autopilot, který nechá LLM rozhodovat o kaloriích, je bezpečnostní riziko a zároveň nereprodukovatelný — když si uživatel bude stěžovat, nezjistíš proč.

### 6.3 Dva obsahové blockery

Nejsou to AI problémy a žádný prompt je neobejde:

**Recepty — problém není nutrice, ale filtrovatelnost a hloubka.** Ověřeno dotazem: všech **505 receptů má kompletní nutrici** (kcal, B/S/T), český název, postup i ingredience, a makra jsou předpočítaná na receptu. Obava v1 o chybějící nutriční data se nepotvrdila. Skutečná čísla:

| Problém | Čísla |
|---|---|
| Neaktivních receptů | **207 z 505 (41 %)** — jen 298 je `active` |
| Bez dietních tagů | **231 z 505 (46 %)** — nejdou filtrovat pro vegana/alergie |
| Použitelné svačiny | **32** (oběd 123, snídaně 83, večeře 60) |

Recept bez dietních tagů musíš buď vyloučit z kandidátního setu — a přijít o polovinu katalogu — nebo riskovat, že veganovi navrhneš kuřecí. A svačin je tak málo, že při jedné denně uživatel vyčerpá celý katalog za měsíc: metrika diversity ≥ 0,7 v 7denním plánu na svačinách a večeřích neprojde kvůli obsahu, ne kvůli modelu.

**41 cvičení v `exercise_asset_registry` nestačí** na 3–4 tréninky týdně s progresí a variabilitou. Rozpad po partiích (9 partií, 6 typů vybavení, jen 27 s vizuálem):

```
horní nohy 11 · hrudník 6 · záda 5 · paže 5 · břicho 5
ramena 3 · kardio 3 · lýtka 1 · celé tělo 1 · bez zařazení 1
```

Se třemi cviky na ramena a jedním na lýtka nepostavíš tříměsíční plán s progresí. Řádově potřebuješ 150+ s tagy (svalová skupina, vybavení, obtížnost, náhrady).

### 6.4 Evaly — Promptfoo, tři vrstvy

Nástroj není preference: **OpenAI vypíná vlastní Evals platformu a v migračním guidu posílá lidi na Promptfoo.** Open source, běží v CI, evaly jsou YAML v gitu → verzují se spolu s prompty, jeden commit = prompt + jeho testy. Braintrust ($249/měs) ani LangSmith teď nekupuj — jejich hodnota je týmová kolaborace při vysokém objemu.

Hranice: **cokoli vyjádřitelné číslem nebo lookupem → deterministický kód. LLM-as-judge výhradně na subjektivní kvalitu.**

- Vrstva 1: validace v produkci u každého plánu (100 % pokrytí, viz 6.2 krok 5)
- Vrstva 2: golden dataset 20–30 **syntetických** profilů (žádná reálná data — skončila by v CI logu navždy). Pokryj edge case, ne průměr: vegan + laktóza, 45letá žena BMI 31 sedavá, sportovec 3500 kcal, alergie na 5 potravin, extrémní cíl (musí být zamítnut). Metriky: macro_accuracy, restriction_violations = 0 (hard fail), catalog_grounding 100 % (halucinovaný recept je nejčastější tichá chyba, kterou uživatel odhalí až v kuchyni), diversity ≥ 0.7, safety_floor.
- Vrstva 3: LLM-as-judge na tón, českou kulturní vhodnost jídel, praktičnost, koherenci tréninku. **Povinně s kalibračním setem** — 20 příkladů, kde znáš správnou odpověď. Souhlas s tebou pod 85 % = rubric je špatný a měříš šum. Nekalibrovaný judge je horší než žádný eval, protože dává falešnou důvěru.

### 6.5 Náklady — rezervace před voláním, ne účetnictví po

**Anti-pattern, který tam pravděpodobně je:** `openai_daily_usage` se plní **po** volání. To je účetnictví, ne kontrola. Bug v tool loopu vygeneruje $500 dřív, než se zapíše první řádek.

Správně: atomická rezervace odhadu před voláním + reconciliace skutečné usage po. Plus platformní limity na oddělených projektech (`prod`/`dev`/`ci`), per-user kvóty dle tarifu, per-request stropy (`max_output_tokens`, timeout, `maxToolIterations`), kill switch s graceful degradation (přepni na menší model, vypni nekritické úlohy), a alerting nad `ai_runs` — sleduj **cost/uživatel p95** a **requests/uživatel p95**, bez nich neuvidíš jednoho člověka spotřebovávajícího 80 % budgetu.

Orientačně u chat modelu střední třídy a kontextu ~5k tokenů s 60% cache: ~$0.003/zpráva, tedy ~1–5 $/měsíc na aktivního uživatele podle intenzity — proti 1499 Kč tržby zdravé. Zlomí to: vynechaný prompt caching (+40 %), `previous_response_id` chaining (2–4×), nejdražší model v hot path (6×), a runaway tool loop (stovky dolarů za noc).

---

## 7. Sekvence

**Fáze 0 — okamžitá rizika.** Rozepsané v [`PRIORITY.md`](PRIORITY.md), pořadí podle rizika a poměru přínos/práce:

1. **Nabité zbraně v produkci** — smazat `github-patch` a `GITHUB_TOKEN` ze secrets, rozhodnout osud prototypu `generate-plan`, shodit trigger `users_insert` na `public.users`.
2. **Anonymně volatelné funkce** — 16 `SECURITY DEFINER` funkcí volatelných rolí `anon`, u 15 z nich navíc `search_path=public` místo `''`. Revoke po ověření call-sites; u skupiny, která musí být veřejná, přesun logiky za rate-limiting, ne slepé odebrání.
3. **Záloha a odolnost** — offline `pg_dump`, `backups/` do `.gitignore` *před* prvním dumpem, CI/CD pro edge funkce, `deno.lock` a pinnuté importy.
4. **Validační gate** jako pojistka proti regresi (viz 6.2).
5. **Obsahové blockery** — recepty a cvičení (viz 6.3); práce na obsahu, běží paralelně.
6. **RLS výkon a hygiena** — 31 politik na `(select auth.uid())`, duplicitní indexy, chybějící FK indexy, drop záložních tabulek.

Migrace z Assistants API v tomto seznamu **není** — Assistants API se v repu nepoužívá nikde (viz sekce 8, bod 5).

**Fáze 1 — redukce schématu (týden po P0, breaking, ale bezpečné).** `pg_dump` do offline souboru. Ověř nulové call-sites **i mimo Next.js kód** — Make.com scénáře mají hardcoded REST URL, plus views, DB funkce, triggery, `pg_depend`. Pak drop: `subscriptions`, `fitness_goals`, `nutrition_logs`, `progress_tracking`, `ai_agents_logs`, teprve pak `public.users`. Rozhodni tři koncepty check-inu → nech jeden. Projdi 52 tabulek s RLS bez politiky a dropni mrtvé. **Cíl: 90 → ~50 tabulek.**

> `progress_tracking` před dropem koncepčně zaparkuj: subjektivní skóre (energie, nálada, spánek, motivace) a progress fotky *jsou* funkce, kterou budeš chtít. Fotky patří do Storage + `progress_photos`, skóre do check-in tabulky, `ai_analysis` do AI vrstvy.

**Fáze 2 — identita.** `profiles.id` → PK + FK na `auth.users`. Cleanup orphanů. FK z tabulek s daty → `profiles(id) on delete cascade` + `not null` + index. **Otestuj smazání účtu v lokálním stacku**, ne v produkci.

**Fáze 3 — timestamptz.** Normalizuj všechny `timestamp without time zone`. Při desítkách řádků instantní `ALTER TABLE`; při milionech table rewrite s exclusive lockem. Proto teď.

**Fáze 4 — entitlementy.** `plans` + enumy + rozšíření `memberships`. `private.stripe_events` + idempotence. Přepiš webhook na refetch z API + guard `source='stripe'`. `has_access()` + refactor všech gate checků. `program_enrollments`. Noční rekonciliace. Migruj beta přístup do `memberships` jako `source='beta'`.

**Fáze 5 — měření.** Přejmenuj `apple_health_metric_defs` → `metric_defs`, `apple_health_metrics` → `measurements`, přidej `source`/`source_device`/`source_record_id`/UNIQUE. `metric_source_priority` + `daily_metrics`. Migruj Withings a `body_metrics`. Rozřež `body_metrics`, pak drop. Drop `body_measurements`. Cross-source dedup. Raw do `private` + retenční cron. Migruj `registrations`, pak drop.

**Fáze 6 — orchestrace.** Inkrementálně, nikdy big-bang. Pořadí podle rizika: lifecycle e-maily → `generate-plan` → Autopilot → TED. Starý scheduler nech běžet paralelně za feature flagem na `user_id`, přepínej po jednom. Idempotence: unique `(user_id, task_type, period_key)`, idempotency key na každý externí efekt. `ai_tasks` přestává být fronta a stává se auditním záznamem — to je jeho správná role.

**Fáze 7 — role a trenér.** `user_roles` + JWT claim jen na roli. `coach_clients` s accept flow. `accessible_user_ids()` + jednotné politiky. **pgTAP testy psané PŘED nasazením politik.** Pak UI.

**Fáze 8 — TED.** Až po všem výše. Bitemporální paměť, rollupy, guardraily, evaly, kvóty.

### Co musí čekat

`private` schéma pro raw payloady až po fázi 1 (přesouvat tabulky, z nichž polovinu dropneš, je práce nazmar) — výjimka jsou raw payloady ve fázi 5, tam to jde ruku v ruce. Stripe Sync Engine až u SQL reportingu nad billingem. Stripe Entitlements API až u per-feature gatingu. Materialized views a partitioning až přes ~1–2 M řádků. pgvector až přes ~80 faktů na uživatele. **Schémata `app`/`ai`/`analytics` nikdy** (viz níže).

---

## 8. Pět chyb, které se už staly

První čtyři jsou z verze 1, pátou udělala verze 2. Zapsané, protože se dají snadno udělat znovu.

**1. „Nechat orchestraci v Supabase, nezavádět nic dalšího."** Záměna „nepřidávat nástroje" za „nepřidávat práci". Přidání *jedné* věci (durable execution) umožní **smazat 5 tabulek a jednu edge funkci** a přestat psát vlastní retry/lease/backoff — čistá redukce složitosti. Navíc rada ignorovala, že Supabase edge funkce jsou pro LLM workload špatný runtime (150 s wall clock, 2 s CPU na Free) a že kritický kód není v gitu. Chybějící failure modes ve vlastním enginu: retry s backoffem, lease/visibility timeout (task uvízne navěky v `processing` a nikdo ho nepřevezme), idempotence, dead letter queue, concurrency limit, catch-up po výpadku.

**2. „Rozdělit 90 tabulek do schémat app/ai/integrations/analytics/beta."** Špatná odpověď. Všechny ty tabulky appka čte přes PostgREST, tedy musí být exponované, tedy potřebují RLS — nic se nezjednodušilo a zaplatil bys refactorem každého call-site a rozbitím embeddingu. Logické seskupení řeš **prefixem v názvu** (`ai_`, `beta_` — což už děláš). Jediné schéma s reálným přínosem je `private` pro věci, kam se klient nesmí dostat ani teoreticky.

**3. „`subscriptions` jako zrcadlo Stripe, `memberships` jako odvozený entitlement."** Postavené na chybném předpokladu, že webhook nefunguje. Funguje a píše do `memberships`. `subscriptions` je mrtvá legacy s chybným mapováním `cancel_at_period_end`. A hlavně: otázka „memberships vs subscriptions" byla falešná dichotomie — správná odpověď jsou **tři vrstvy**, protože entitlement není jen tier z předplatného (beta, trenér, staff, jednorázový 12týdenní program).

**4. „Naplnit `body_measurements` jako kanonickou časovou řadu."** Generalizovat se má `apple_health_metrics` — 5035 řádků a 45 metric defs hotové práce v long formátu. `body_measurements` je prázdná a duplikuje ji.

**5. „Assistants API se vypíná 26. 8. 2026 a `generate-plan` na něm stojí." — chyba verze 2.** Neplatí. Nasazená funkce volá Chat Completions přes holý `fetch` s modelem `gpt-4o-mini`; `assistants`, `threads` ani `runs` se v repu nevyskytují nikde a `gpt-4o-mini` není deprecated. Jediná stopa je mrtvá env proměnná `OPENAI_ASSISTANT_ID` v `scripts/verify-env-required.mjs`, která se nikde nečte.

Jak chyba vznikla, je důležitější než chyba sama: tvrzení bylo odvozeno z **komentáře u tabulky** `ai_generated_plans` („AI generované plány (OpenAI Assistant)"), ne z kódu, a pak předáno konzultantovi jako fakt. Ověřovalo se datum deprecace, ne premisa. **Popisek v databázi není zdroj pravdy o kódu.** Následek byl umělý deadline, který podřídil pořadí prací něčemu, co neexistuje.

**Co v1 zcela vynechala:** roli trenéra a její autorizaci, GDPR kaskádu vs. zákonnou retenci účetnictví, normalizaci `timestamptz`, testovací strategii (pgTAP), determinismus v generování plánů (solver místo LLM) a circuit breaker na náklady.
