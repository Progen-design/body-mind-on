# Návrhy vylepšení programu a napojení na Google Kalendář

## 0. Hlavní cíl: kdy má uživatel jaký trénink (trenér + info@)

**Cíl:** Aby **každý uživatel věděl, kdy má jaký trénink**. Zdroj této informace je **trenér**; napojení na kalendář se dělá přes **hlavní profil info@** (jeden centrální účet), ne přes kalendář každého uživatele.

**Model:**
- **Trenér** (ty) určuje, kdy jsou tréninky – buď přímo v Google Kalendáři účtu **info@** (např. info@bodyandmindon.cz), nebo v budoucnu v aplikaci v „trenérské“ sekci.
- **Aplikace** se napojí na **jeden** Google Kalendář (info@): na backendu budou uložené přístupové tokeny pro tento účet. Žádné propojování kalendáře od jednotlivých uživatelů.
- **Uživatelé** v aplikaci (profil) uvidí přehled „Kdy mám trénink“ – data se načtou z kalendáře info@ (čtení událostí přes Calendar API). Podle nastavení může jít o:
  - **Společný rozvrh** pro všechny (jedna skupina, jeden kalendář) – např. „Pondělí 17:00 Silový, Středa 18:00 Kardio“;
  - nebo později **přiřazení událostí k uživatelům** (např. v popisu události jméno/e-mail klienta), aby každý viděl jen své termíny.

**Kroky k nasazení (stručně):**
1. **Google účet info@** – přihlášení do Google, vytvoření kalendáře (nebo použití primárního). Trenér sem dává události (tréninky).
2. **Jedno napojení v aplikaci** – OAuth pro info@ (nebo service účet s přístupem ke kalendáři info@), uložení tokenů na serveru (env nebo tabulka „trainer_calendar_tokens“ pro jeden záznam).
3. **API na backendu** – např. `GET /api/calendar/upcoming` (nebo `/api/trainer-schedule`): načte z kalendáře info@ události v daném rozmezí (týden/dva), vrátí je jako JSON.
4. **Profil uživatele** – nová sekce „Kdy mám trénink“ / „Plánované tréninky“: volá toto API a zobrazí seznam (datum, čas, název). Zdroj = vždy kalendář info@.

Tím pádem **zdrojem pravdy** je trenér (info@ kalendář); uživatelé jen čtou a vidí, kdy mají trénink. Rozšíření (filtrování na konkrétního klienta, zápis absolvovaného tréninku do kalendáře) lze doplnit později.

---

## 1. Přehled vylepšení programu (obecná doporučení)

### UX a funkce
- **Přihlášení přes Google** – Supabase Auth podporuje OAuth provider; přidat „Přihlásit se přes Google“ vedle e-mailu zjednoduší registraci a později umožní jednotný účet pro kalendář.
- **Push / notifikace** – připomínky na trénink nebo návyky (PWA s notifikacemi nebo e-mailové připomínky v určitý čas podle preferencí uživatele).
- **Export dat** – tlačítko „Stáhnout má data“ (CSV/JSON: tréninky, návyky, váha) pro transparentnost a zálohu.
- **Mobilní zkušenost** – ověřit touch targets, rychlé akce („Zapsat trénink“ z hlavní obrazovky), případně PWA manifest a instalace na plochu.
- **Zobrazení vnímané náročnosti** – v historii tréninků zobrazit uloženou náročnost (Snadné / Tak akorát / …) a volitelně jednoduchou statistiku (např. podíl „tak akorát“ za měsíc).

### Data a výpočty
- **Denní digest** – rozšířit o krátkou větu z plánu na daný den (mindset tip) nebo o doporučený trénink z plánu, pokud je v plánu uveden.
- **Odhad váhy** – v budoucnu zvážit jemnější korekci z návyků (např. váha podle počtu zdravých/zlozvyků v týdnu), zatím je základní model v pořádku.
- **Opt-out denního e-mailu** – v nastavení profilu nebo v DB (např. `user_preferences.daily_email: false`) umožnit vypnutí denního digestu.

### Technické
- **Rate limiting** – rozšířit na další citlivé endpointy (workouts, habits), aby byly chráněné před zneužitím.
- **Audit / log** – u kritických akcí (smazání účtu, změna e-mailu) logovat minimálně čas a user_id pro podporu a debugging.

---

## 2. Napojení na Google Kalendář – návrh

### 2.0 Doporučený model: jeden kalendář trenéra (info@)

V souladu s cílem z kap. 0 (uživatel ví, kdy má jaký trénink; trenér to řídí; napojení přes info@):

- **Jeden** Google účet (info@) má jeden kalendář s plánovanými tréninky.
- **Aplikace** má na serveru uložené OAuth tokeny **pro tento jeden účet** (např. v env nebo v tabulce `trainer_calendar_tokens` s jedním záznamem). Žádné tokeny po uživatelích.
- **Backend** používá tyto tokeny jen k **čtení** událostí z kalendáře info@ (Calendar API `events.list`). Uživatelé pak v aplikaci vidí např. sekci „Plánované tréninky“ naplněnou z tohoto kalendáře.
- **Propojení (connect)** provede jednou někdo s přístupem k info@ (trenér/admin): otevře v prohlížeči speciální stránku nebo API, přihlásí se k Google s účtem info@, autorizuje aplikaci a callback uloží tokeny. Od té chvíle aplikace umí číst z kalendáře info@.

Výhody: jednoduchá správa (jeden zdroj), uživatelé nemusí nic propojovat, trenér má plán pod kontrolou v Google Kalendáři.

**Přiřazení tréninku konkrétnímu uživateli (plánování pro dané klienty):**

Aplikace zobrazuje každému přihlášenému uživateli **jen události, které jsou mu přiřazené**. Trenér při plánování v Google Kalendáři použije jednu z těchto možností:

1. **V popisu události**  
   Do pole „Popis“ události napiš řádek:  
   `Pro: email@uzivatele.cz`  
   (přesně tento tvar; pro více lidí můžeš napsat např. `Pro: jan@x.cz, eva@y.cz`).  
   Daná událost se pak zobrazí jen uživatelům s těmito e-maily.

2. **Účastníci (Pozvánky)**  
   V události v Google Kalendáři přidej e-mail klienta jako **účastníka** (Pozvánky / Add guests). Událost uvidí jen uživatelé s tímto e-mailem v aplikaci.

3. **Bez přiřazení**  
   Událost bez „Pro:“ v popisu a bez účastníků se zobrazí **všem** uživatelům (společný / skupinový trénink).

**Shrnutí pro trenéra:** Vytváříš události v kalendáři info@ jako obvykle. Chceš-li trénink jen pro konkrétního klienta, přidej do popisu `Pro: jeho@email.cz` nebo ho přidej jako účastníka události. Klient pak uvidí tento trénink v sekci „Kdy mám trénink?“ na svém profilu.

**Implementační checklist (info@):**
1. Google Cloud: projekt, Calendar API, OAuth 2.0 Client (Web), redirect URI na tvou doménu (např. `/api/auth/google-calendar/callback`).
2. Jednorázové propojení: stránka/endpoint „Propojit kalendář trenéra“ (pouze pro admin/trenéra), redirect na Google s účtem info@, callback uloží `access_token` a `refresh_token` do DB (tabulka `trainer_calendar_tokens`) nebo do env. Scope: `https://www.googleapis.com/auth/calendar.events` nebo `calendar.readonly`.
3. Backend knihovna: refresh tokenu při vypršení, volání Calendar API `events.list` pro zadané časové rozmezí (např. od dnes + 14 dní).
4. API pro klienty: např. `GET /api/trainer-schedule?from=...&to=...` – vrací události z kalendáře info@ (bez nutnosti přihlášení uživatele, nebo jen pro přihlášené). Frontend na profilu: sekce „Plánované tréninky“ volá toto API a zobrazí seznam (datum, čas, název události).

---

### 2.1 Alternativa: per‑user kalendář (pro budoucí rozšíření)

Níže popis umožňuje **konkrétnímu uživateli** propojit **svůj** Google účet – vhodné až tehdy, kdy budeš chtít např. zapisovat uživatelovy odtrénované tréninky do jeho vlastního kalendáře. Pro hlavní cíl „kdy mám jaký trénink“ stačí model s info@ výše.

### 2.1 Co bude potřeba (přehled)

| Oblast | Popis |
|--------|--------|
| **Google Cloud** | Projekt, Calendar API zapnuté, OAuth 2.0 přihlašovací údaje (typ „Web application“). |
| **OAuth scope** | `https://www.googleapis.com/auth/calendar.events` (čtení + zápis událostí), popř. `calendar.readonly` jen pro čtení. |
| **Úložiště tokenů** | Tabulka v Supabase pro ukládání `access_token`, `refresh_token` a `expires_at` **na uživatele** (vázáno na `user_id` z auth). |
| **Backend** | Endpointy: zahájit OAuth flow, callback pro uložení tokenů, endpoint pro čtení/zápis kalendáře (s použitím uloženého refresh tokenu). |
| **Frontend** | Stránka nebo sekce v profilu: „Propojit Google Kalendář“ → tlačítko → redirect na Google → po návratu uložení a potvrzení. |

### 2.2 Možné funkce po propojení

1. **Zápis tréninků do kalendáře**  
   Po uložení tréninku („Zapsat trénink“) automaticky vytvořit v uživatelově primárním kalendáři událost (datum, název např. „Trénink – Silový“, délka dle `duration_min`). Uživatel uvidí tréninky i v Google Kalendáři.

2. **Zobrazení kalendáře v aplikaci**  
   V profilu nebo v nové záložce „Kalendář“ zobrazit náhled událostí z Google (např. týden) – např. přes Calendar API `events.list` s časovým rozmezím. Zobrazení může být jednoduchý seznam nebo mřížka dnů.

3. **Import událostí jako návrh na trénink**  
   Pravidelně (cron) nebo na vyžádání projít kalendář uživatele, najít události s klíčovými slovy („trénink“, „cvičení“, „gym“) a nabídnout: „Máš v kalendáři událost X – chceš ji zapsat jako trénink?“ s předvyplněným datem a délkou.

4. **Připomínky v kalendáři**  
   Podle plánu nebo návyků vytvářet v kalendáři „soft“ události (např. „Trénink podle plánu“, „Meditace“) jako připomínku – uživatel je může přesunout nebo smazat.

Doporučení na start: implementovat **bod 1 (zápis tréninků do kalendáře)** a **propojení účtu (Connect / Disconnect)**. Ostatní body lze přidat postupně.

### 2.3 Kroky implementace (stručně)

**Krok 1 – Google Cloud**  
- V [Google Cloud Console](https://console.cloud.google.com/) vytvořit projekt (nebo použít stávající).  
- Zapnout **Google Calendar API**.  
- V **APIs & Services → Credentials** vytvořit **OAuth 2.0 Client ID** typu „Web application“.  
- Do **Authorized redirect URIs** přidat např. `https://app.bodyandmindon.cz/api/auth/google-calendar/callback` (a pro lokál `http://localhost:3000/api/auth/google-calendar/callback`).  
- Uložit **Client ID** a **Client Secret** do env proměnných (např. `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`).

**Krok 2 – Databáze (Supabase)**  
- Vytvořit tabulku pro tokeny, např.:

```sql
CREATE TABLE user_google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  calendar_id text DEFAULT 'primary',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own calendar tokens"
  ON user_google_calendar_tokens FOR ALL
  USING (auth.uid() = user_id);
```

- RLS zajistí, že uživatel vidí a mění jen své záznamy; API bude používat service role pro čtení/refresh tokenu na backendu.

**Krok 3 – Backend (Next.js API)**  
- **GET (nebo POST) `/api/auth/google-calendar/connect`**  
  - Přesměruje uživatele na Google OAuth consent URL (scope `calendar.events` nebo `calendar`).  
  - Parametr `state`: po návratu identifikace (např. zakódované `user_id` nebo session nonce), aby callback věděl, komu token uložit.  

- **GET `/api/auth/google-calendar/callback`**  
  - Google sem po přihlášení uživatele pošle `code`.  
  - Vyměnit `code` za `access_token` a `refresh_token` (server-side).  
  - Z `state` získat aktuálního uživatele (např. z session nebo JWT).  
  - Uložit tokeny do `user_google_calendar_tokens` (pro dané `user_id`).  
  - Přesměrovat uživatele zpět na profil s query např. `?calendar=connected`.  

- **POST `/api/calendar/disconnect`**  
  - Přihlášený uživatel (Bearer token); smazat řádek z `user_google_calendar_tokens` pro jeho `user_id`.  

- **POST `/api/calendar/sync-workout`** (nebo volat interně po uložení tréninku)  
  - Vstup: `workout_id` nebo údaje o tréninku (datum, typ, délka).  
  - Načíst pro uživatele `refresh_token`, vyměnit za nový `access_token` (pokud vypršel).  
  - Zavolat Google Calendar API `events.insert` – vytvořit událost v `primary` kalendáři (název, datum, délka).  

- Pomocná **knihovna** (např. `lib/googleCalendar.js`):  
  - funkce na vygenerování OAuth URL,  
  - výměna `code` za tokeny,  
  - refresh `access_token` z `refresh_token`,  
  - volání Calendar API (vytvoření události, příp. načtení seznamu událostí).

**Krok 4 – Frontend (profil)**  
- V nastavení nebo v sekci „Integrace“:  
  - Pokud uživatel **nemá** záznam v `user_google_calendar_tokens`: tlačítko **„Propojit Google Kalendář“** → redirect na `/api/auth/google-calendar/connect`.  
  - Po návratu z Google zobrazit např. toast „Kalendář propojen. Tréninky se budou zapisovat do tvého Google Kalendáře.“  
  - Pokud **má** propojený kalendář: zobrazit „Google Kalendář je propojen“ + tlačítko **„Odpojit“** (volá `/api/calendar/disconnect`).  

- Po úspěšném uložení tréninku (v `handleAddWorkout`):  
  - Pokud je kalendář propojen, zavolat např. `POST /api/calendar/sync-workout` s údaji o právě uloženém tréninku (nebo to volat z API `workouts` po insertu).  

- Volitelně: jednoduchá nastavení, např. „Zapisovat tréninky do kalendáře“ (checkbox), uložené v `user_google_calendar_tokens` nebo v `user_preferences`.

### 2.4 Bezpečnost a env

- **Client Secret** a **refresh_token** nikdy neposílat do prohlížeče; výměna kódu za tokeny a volání Calendar API pouze na serveru.  
- Vercel (nebo jiný host): nastavit env `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` a v Google Console mít správné redirect URI pro produkci.  
- Redirect URI musí přesně odpovídat (včetně konce lomítka / bez něj), jinak Google OAuth vrátí chybu.

### 2.5 Shrnutí priorit

| Priorita | Úkol |
|----------|------|
| 1 | Google Cloud projekt, Calendar API, OAuth credentials, redirect URI |
| 2 | Tabulka `user_google_calendar_tokens`, migrace |
| 3 | Endpointy: connect (redirect na Google), callback (uložení tokenů), disconnect |
| 4 | Knihovna: refresh tokenu, vytvoření události v Calendar API |
| 5 | Po uložení tréninku: volat sync do kalendáře (pokud uživatel má propojeno) |
| 6 | Frontend: tlačítko Propojit / Odpojit, feedback po propojení |

Tím získáš plně funkční napojení konkrétního člověka na jeho Google Kalendář s možností zápisu tréninků; rozšíření o zobrazení kalendáře nebo import událostí lze postavit na stejném OAuth a tabulce tokenů.
