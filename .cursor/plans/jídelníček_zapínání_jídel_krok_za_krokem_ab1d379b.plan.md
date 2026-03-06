---
name: Jídelníček zapínání jídel krok za krokem
overview: "Implementace funkce „Zahrnout do dalšího týdne“ u každého jídla v jídelníčku: migrace DB, API meal-pins, rozšíření generování plánu o označená jídla a UI v PlanViewer s togglem a toasty."
todos: []
isProject: false
---

# Plán: Zapínání jídel do dalšího týdne – krok za krokem

Výchozí návrh je v [docs/NAVRH_JIDELNICEK_ZAPINOVANI_JIDEL.md](docs/NAVRH_JIDELNICEK_ZAPINOVANI_JIDEL.md). Níže jsou konkrétní kroky v pořadí, v jakém je máš udělat.

---

## Krok 1: Migrace – tabulka `user_meal_pins`

**Co udělat:** Vytvoř novou migraci v Supabase a spusť ji (lokálně nebo přes Supabase Dashboard).

**Soubor:** nový soubor v `supabase/migrations/`, např. `YYYYMMDD_user_meal_pins.sql`.

**Obsah migrace (zkopíruj z návrhu):**

- Tabulka `user_meal_pins` s sloupci: `id` (uuid, PK), `user_id` (uuid, FK na `auth.users`), `meal_type` (text), `meal_text` (text), `created_at` (timestamptz).
- UNIQUE constraint na `(user_id, meal_type, meal_text)`.
- Index na `user_id`.
- RLS zapnuté, policy: uživatel může číst/insert/update/delete jen své řádky (`auth.uid() = user_id`).

**Ověření:** Po spuštění migrace v DB uvidíš tabulku `user_meal_pins` a policy.

---

## Krok 2: API endpoint `/api/meal-pins`

**Co udělat:** Přidat jeden soubor handleru, který obslouží GET i POST.

**Soubor:** nový [pages/api/meal-pins.js](pages/api/meal-pins.js).

**GET (načtení pinů):**

- Ověř Bearer token (jako v [pages/api/profile.js](pages/api/profile.js)) a získej `user_id` z `supabaseServer.auth.getUser(token)`.
- SELECT z `user_meal_pins` WHERE `user_id = user.id`, vrať pole `{ meal_type, meal_text }`.
- Odpověď: `{ pins: [ { meal_type, meal_text }, ... ] }`.

**POST (přidat / odebrat):**

- Stejná autorizace.
- Body: `{ action: 'add' | 'remove', meal_type: string, meal_text: string }`.
- **Normalizace** `meal_text`: trim, odstranit diakritiku (např. `normalize('NFD').replace(/\p{Diacritic}/gu, '')`), zkrátit na max ~200 znaků (nebo první větu). Stejnou funkci použij při ukládání i při mazání (DELETE podle normalizovaného textu).
- **add:** INSERT do `user_meal_pins` (user_id, meal_type, normalizovaný meal_text). Při konfliktu na UNIQUE nic nedělej (nebo ON CONFLICT DO NOTHING).
- **remove:** DELETE FROM user_meal_pins WHERE user_id AND meal_type AND meal_text (normalizovaný).
- Odpověď: `{ ok: true, pins: [ ... ] }` – aktuální seznam pinů po změně (SELECT znovu).

**Chyby:** 401 když není token / neplatný uživatel, 400 když chybí `action` / `meal_type` / `meal_text`.

---

## Krok 3: Generování plánu – načtení pinů a rozšíření promptu

**Co udělat:** Před voláním asistenta načíst piny uživatele a předat je do promptu.

**Soubor:** [lib/generatePlan.js](lib/generatePlan.js).

**3a) Načtení pinů v `generatePlanForEmail`:**

- Po určení `bm` (řádky cca 411–426) a pouze pokud existuje `bm.user_id`:
  - SELECT z `user_meal_pins` WHERE `user_id = bm.user_id`.
  - Sestavit pole řetězců: `pinnedMeals = rows.map(r =>` ${r.meal_type}: ${r.meal_text}`)` (nebo ekvivalent).
- Pokud nemáš `user_id` (např. starý záznam jen po e-mailu), `pinnedMeals` nech prázdné.

**3b) Rozšíření `buildUserPrompt(bm, pinnedMeals)`:**

- Přidat druhý parametr: `pinnedMeals` (pole řetězců, volitelné).
- Na konci promptu (za stávající text o jídelníčku a Trénink) přidat blok:
  - Pokud `pinnedMeals?.length > 0`: text typu: „Uživatel si označil tato jídla pro zahrnutí do plánu. POVINNĚ je zakomponuj do jídelníčku na vhodné dny a časy (snídaně jako snídaně, oběd jako oběd, večeře jako večeře). Můžeš je mírně upravit (porce, příloha), ale název/charakter jídla zachovej. Označená jídla: “ + pinnedMeals.join('; ').“
  - Pokud prázdné, nic nepřidávat.

**3c) Rozšíření `buildMealsOnlyPrompt` (režim jen jídelníček):**

- Stejný blok o označených jídlech přidat i do `buildMealsOnlyPrompt`, pokud budeš předávat `pinnedMeals` (např. přidat parametr `pinnedMeals` a v `generatePlanForEmail` ho předat i při volání `buildMealsOnlyPrompt`).

**3d) Volání `buildUserPrompt`:**

- Všechna volání `buildUserPrompt(bm)` změnit na `buildUserPrompt(bm, pinnedMeals)` (v `generatePlanForEmail` předat `pinnedMeals` sestavené v kroku 3a).

---

## Krok 4: Frontend – PlanViewer, tlačítko a stav pinů

**Co udělat:** U každé karty jídla zobrazit tlačítko „Zahrnout do dalšího týdne“ (toggle), načíst piny a po kliku volat API.

**Soubor:** [components/PlanViewer.js](components/PlanViewer.js).

**4a) Stav a načtení pinů:**

- Přidat state: `mealPins` (pole objektů `{ meal_type, meal_text }`) a `mealPinsLoading` (boolean).
- Pomocná funkce **normalizace** `meal_text` na frontendu: stejná logika jako v API (trim, odstranit diakritiku, zkrátit), aby porovnání „je toto jídlo zapnuté?“ bylo konzistentní s backendem.
- Při mountu nebo když se změní `plan` (např. v `useEffect` závislém na `plan?.id` nebo `plan?.plan_html`): pokud je uživatel přihlášen (např. `supabase.auth.getSession()`), volat `GET /api/meal-pins` s Bearer tokenem a uložit odpověď do `mealPins`.

**4b) Funkce „je jídlo zapnuté?“:**

- Funkce `isPinned(mealType, mealText)`: normalizovat `mealText` a zkontrolovat, zda v `mealPins` existuje záznam se stejným `meal_type` a normalizovaným `meal_text`.

**4c) Toggle pin:**

- Funkce `handleTogglePin(mealType, mealText)`:
  - Normalizovat `mealText`.
  - Zavolat `POST /api/meal-pins` s body `{ action: isPinned(mealType, mealText) ? 'remove' : 'add', meal_type: mealType, meal_text: mealText }` (pro API posílat původní text před normalizací nebo konzistentní hodnotu – backend stejně normalizuje).
  - Po úspěchu aktualizovat `mealPins` z odpovědi (`res.pins`) a zobrazit toast (viz 4d).

**4d) UI u každého jídla:**

- V místě, kde se vykresluje karta jídla (blok s `plan-meal-card`, řádky cca 880–899), přidat vedle tlačítka „Nahradit jiným“ tlačítko typu:
  - „Zahrnout do dalšího týdne“ (nebo ikona palce nahoru).
  - Pokud `isPinned(meal.type, mealFullText)` (nebo ekvivalent z `meal.text` + override): tlačítko zvýrazněné (aktivní stav).
  - `onClick` volá `handleTogglePin(meal.type, mealFullText)` a `e.stopPropagation()`, aby se nespustil recept.
- Tooltip (title): „Přidá toto jídlo do dalšího týdne – při příštím generování plánu ho AI zahrne.“

**4e) Toast:**

- PlanViewer nemá vlastní toast; v [pages/profil.js](pages/profil.js) se používá např. `setToast`. Možnosti:
  - Přidat do `PlanViewer` volitelnou prop `onToast({ message, type })` a na stránce [profil.js](pages/profil.js) předat `onToast={(...) => setToast(...)}`, nebo
  - Jednoduché lokální stavové hlášení v PlanViewer (např. malý text pod tlačítkem „Přidáno do dalšího týdne“ na 2 s) bez závislosti na profilu.
- Po úspěšném add: „Přidáno do dalšího týdne.“ Po remove: „Odebráno z dalšího týdne.“

**4f) Viditelnost tlačítka (volitelně):**

- Pokud chceš zobrazovat tlačítko jen při platném členství: přidat do `PlanViewer` volitelnou prop např. `canPinMeals` (boolean). V [profil.js](pages/profil.js) při renderu `PlanViewer` předat `canPinMeals={membershipStatus === 'active' || (membershipStatus === 'trial' && !isTrialExpired)}`. V PlanViewer vykreslovat tlačítko jen když `canPinMeals !== false`.

---

## Krok 5: Ověření celého toku

**Co udělat:**

1. Spusť migraci a ověř, že `user_meal_pins` existuje a RLS funguje (přihlášený uživatel vidí jen své řádky).
2. V prohlížeči otevři profil s jídelníčkem, klikni u jednoho jídla na „Zahrnout do dalšího týdne“ – ověř, že se změní stav a v DB se objeví záznam.
3. Zkus odebrat pin (druhý klik) – záznam zmizí a odpověď GET i POST je konzistentní.
4. Změň preference (např. jen stravu) a nech přegenerovat plán – v logu nebo v e-mailu ověř, že v promptu asistenta je blok „Označená jídla: …“ a že vygenerovaný plán obsahuje podobné jídlo na vhodném místě.

---

## Shrnutí pořadí


| Pořadí | Krok                                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | Migrace: vytvořit tabulku `user_meal_pins` a RLS.                                                                                                           |
| 2      | API: implementovat GET a POST v `pages/api/meal-pins.js` včetně normalizace.                                                                                |
| 3      | generatePlan.js: načíst piny v `generatePlanForEmail`, rozšířit `buildUserPrompt` a `buildMealsOnlyPrompt` o blok označených jídel.                         |
| 4      | PlanViewer.js: state pinů, GET na mount, tlačítko u každého jídla, toggle přes POST, toast; volitelně prop `canPinMeals` a v profil.js předat dle členství. |
| 5      | Manuální test: pin add/remove, přegenerování plánu a kontrola promptu/výstupu.                                                                              |


Týdenní cron pro automatické generování plánu tento plán neřeší – až budeš cron přidávat, v jeho volání `generatePlanForEmail` už bude načtení `user_meal_pins` a předání do promptu z kroku 3 hotové.