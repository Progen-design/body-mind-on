# Pravdivost dat – tréninkový plán a návody k cvikům

Návrh řešení (jako odborník na fitness a analýzu dat), aby **všechna zobrazená data byla pravdivá, nebyla tam nepravda a systém fungoval stejně pro všechny klienty bez chyb**.

---

## 1. Problém (viz obrázek 2)

- U cviku **Mrtvý tah** se dříve zobrazoval obecný text typu „V posilovně požádej personál o ukázku cviku – rádi poradí.“
- To je **nepravdivé v kontextu**: uživatel očekává konkrétní návod k danému cviku, ne výzvu ke konzultaci.
- Riziko: jiný cvik (např. Rumunský mrtvý tah) mohl spadnout na stejný nebo špatný text → **nesoulad mezi názvem cviku a obsahem**.

---

## 2. Zásady pro pravdivost dat

| Zásada | Popis |
|--------|--------|
| **Jedna pravda na jeden cvik** | Ke každému typu cviku existuje jeden konkrétní popis (ve fitku + doma). Žádný obecný „poraď se s někým“. |
| **Shoda názvu a obsahu** | Text „Ve fitku“ a „Doma“ vždy odpovídá cviku v nadpisu (např. Mrtvý tah ≠ Rumunský mrtvý tah). |
| **Ověřitelné a bezpečné** | Návody jsou konkrétní (poloha těla, typ stroje, dýchání), aby šly ověřit a byly bezpečné. |
| **Fallback jen obecný** | Neznámý cvik → pouze obecný popis (stroj/lavice/tyč podle názvu), nikdy „požádej personál“. |
| **Stejně pro všechny klienty** | Jeden zdroj dat, jedna logika zobrazení, žádné rozdíly mezi uživateli. |
| **Žádné chyby v UI** | Před zobrazením se texty validují – zakázané fráze se nikdy neukážou. |

---

## 3. Co je v kódu uděláno (funguje pro všechny klienty)

- **PlanViewer.js – `getSafeEquipment(iconType)`**  
  **Ochrana pro všechny klienty:** Před zobrazením se vždy použije `getSafeEquipment()`, ne přímo `EXERCISE_EQUIPMENT`. Pokud by text obsahoval zakázané fráze (personál, poradí, požádej, ukáže, konzultace, trenér ti…), automaticky se zobrazí bezpečný výchozí text. Tím pádem **žádný klient nikdy neuvidí nepravdivý nebo nevhodný návod**, ani při chybě v datech.

- **PlanViewer.js – `EXERCISE_EQUIPMENT`**  
  Všechny texty jsou konkrétní; v datech není „personál / poradí / požádej“. U každého známého cviku je vlastní `machine` a `home`.

- **PlanViewer.js – `getExerciseIconType(text)`**  
  Z názvu položky plánu se určí typ cviku. Rozpoznávání pokrývá mj.:  
  rozcvička, závěr, odpočinek, dřepy, kliky, přítahy (v předklonu), výpady, superman, **Rumunský mrtvý tah (RDL)**, **mrtvý tah**, **hip thrust, good morning**, prkno/core/zvedání nohou, tlaky/bench/overhead/military press, leg press. Neznámý cvik → `default` s obecným, ale bezpečným textem.

- **Default**  
  Pro neznámé cviky jen obecný text (stroj na nohy, lavice, tyč/kladka; doma vlastní váha/expander), bez zmínky o radění se s někým.

- **AI instrukce**  
  V `OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md` a `lib/assistantInstructions.js` je pravidlo: nikdy neuvádět v plánu formulace typu „poradit se s personálem“, „požádej personál o ukázku“, „rádi poradí“.

---

## 4. Doporučený postup do budoucna

1. **Nový cvik v plánech**  
   Když AI nebo manuální plán přidá nový cvik (např. „Hip thrust“, „Good morning“):
   - doplnit v `getExerciseIconType()` rozpoznání názvu (regex),
   - doplnit v `EXERCISE_EQUIPMENT` nový klíč s přesným textem pro fitko i doma.

2. **Automatická kontrola v kódu (bez ručního ověřování)**  
   - Aplikace **vždy ověřuje** shodu textu s cvikem: v `getSafeEquipment()` se pro každý typ cviku kontroluje, že text obsahuje příslušná klíčová slova (`EQUIPMENT_MUST_MATCH_KEYWORDS`). Pokud ne, zobrazí se bezpečný výchozí text. Žádné ruční ověřování u každého cviku není potřeba – systém to zajišťuje sám.  
   - Při úpravě nebo přidávání záznamů do `EXERCISE_EQUIPMENT` je potřeba doplnit odpovídající klíčová slova do `EQUIPMENT_MUST_MATCH_KEYWORDS`, aby kontrola dál fungovala.

3. **Jediný zdroj pravdy**  
   Texty k cvikům pouze v `EXERCISE_EQUIPMENT`. Nekopírovat návody do AI promptů; AI generuje jen **názvy cviků a parametry** (série×opakování, minuty, krátký popis provedení). Konkrétní „jak na to ve fitku / doma“ vždy z této tabulky.

4. **Pravidlo pro obsah**  
   Každý řádek v `EXERCISE_EQUIPMENT` musí být **sám o sobě pravdivý a dostačující**: uživatel z textu pozná, co má dělat, bez nutnosti se s někým radit.

---

## 5. Doporučené názvy cviků pro AI (konzistence plánů)

Aby se u co nejvíc položek zobrazil konkrétní návod (ne default), je vhodné, aby AI v plánech používala názvy, které `getExerciseIconType` rozpozná, např.:  
**Rozcvička**, **Dřepy**, **Kliky**, **Přítahy** (v předklonu), **Výpady**, **Mrtvý tah**, **Rumunský mrtvý tah**, **Bench press** / **Tlaky**, **Prkno**, **Core** / **Břicho**, **Závěr** (strečink), **Odpočinek**.  
Volitelně: Hip thrust, Good morning, Leg press, Tlaky na ramena. Neznámé názvy dostanou obecný, ale vždy bezpečný text (default + validace).

---

## 6. Shrnutí

- **Pravdivost** = shoda mezi názvem cviku v plánu a zobrazeným návodem + žádné falešné „poraď se s personálem“.
- **Pro všechny klienty stejně** = jeden zdroj pravdy (`EXERCISE_EQUIPMENT`), jedna logika (`getExerciseIconType` + `getSafeEquipment`), validace před zobrazením → žádné chyby v UI.
- **Implementace** = centrální struktura, konkrétní texty, rozlišení podobných cviků (deadlift vs. RDL), zákaz „radit se“ v AI instrukcích a **runtime ochrana** (`getSafeEquipment`), která zajistí, že zakázané fráze se nikdy žádnému klientovi nezobrazí.
