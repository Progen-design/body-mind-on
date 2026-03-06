# Požadavky od klienta (AD1–AD8) – analýza a návrhy řešení

## Ad1) Scrollování a opakující se informace

**Požadavek:** Nevyhovuje nutnost pořád scrollovat dolů, informace se opakují jen v různé formě.

**Co zjistit:** Klientka má upřesnit *kde přesně* (profil? jídelníček? více sekcí?). Doporučení: požádat o **screenshot nebo označení sekcí** (např. „odtud sem“), kde vidí duplicitu.

**Návrh řešení:**
- Po obdržení screenshotu: identifikovat opakující se bloky (např. cíl plánu + hero + přehled + stejné údaje v kartách).
- Možnosti: sloučit přehled do jedné kompaktní karty; použít záložky (Tabs) místo dlouhého scrollu; zkrátit úvodní sekci a důležité informace dát do jednoho „přehledového“ bloku nahoře.

---

## Ad2) Stránka občas „přeskakuje“ někam jinam

**Příčina v kódu:** V `pages/profil.js` je:
1. **Interval 30 s** – každých 30 sekund se volá `refetchProfile()` (obnovení dat).
2. **Visibility change** – při návratu na záložku (tab se stane znovu viditelným) se hned volá `refetchProfile()`.

Při refetchu se může přepočítat layout, scrollovat pozice nebo se znovu vykreslit sekce → dojem „preskakování“.

**Návrh řešení (zapracováno v kódu):**
- Zvýšit interval z 30 s na **2–3 minuty** (nebo vypnout interval a spoléhat jen na ruční „Obnovit“ a na visibility po delším čase).
- U `visibilitychange`: neobnovovat hned, ale až po např. **60+ sekundách** neaktivity záložky, nebo obnovovat jen v pozadí bez přepnutí focusu.

---

## Ad3) Výběr cvičících dnů + ilustrační obrázky

**Požadavek:** Možnost zvolit, které dny budou cvičící (teď je to fixní), a zobrazit ilustrační obrázky z popisu „jak to funguje“.

**Stav v kódu:** Tréninkové dny vycházejí z AI plánu (blok „Trénink tento den“ u každého dne) a z preference **frekvence** (`weekly_sessions` / `freq_choice` – např. 1–2×, 2–3×, 4–5× týdně). Konkrétní dny v týdnu nevybírá uživatel – určuje je generátor plánu.

**Návrh řešení:**
1. **Výběr dnů:**  
   - V nastavení (preference / body_metrics) přidat pole např. `workout_days` (pole čísel 0–6 nebo názvů Po–Ne).  
   - Při generování plánu předat tyto dny do promptu (např. „tréninkové dny: pondělí, středa, pátek“) a u ostatních dnů vracet „Odpočinek.“  
   - V UI: checkboxy nebo multi-select „Cvičím v tyto dny: Po Út St Čt Pá So Ne“.

2. **Ilustrační obrázky:**  
   - Zjistit zdroj obrázků z „jak to funguje“ (Gamma / marketingová stránka).  
   - Přidat je do sekce Jak to funguje na webu nebo do profilu (např. krátký onboarding / nápověda s obrázky).

---

## Ad4) Sekce „Kdy mám trénink?“ – kalendář

**Stav:** Kalendář je ve vývoji. Funguje **jednosměrně od trenéra**: trenér zapíše trénink, klientovi přijde pozvánka e-mailem; po potvrzení se záznam propíše k trenérovi i ke klientovi. Zelená = potvrzeno, žlutá = čeká na schválení. Obousměrná synchronizace (klient přidá z Google kalendáře) by vyžadovala oprávnění v Google účtu klienta – zatím záměrně není.

**Návrh řešení:**
- Do sekce „Kdy mám trénink?“ přidat **krátký vysvětlující text** (1–2 věty): že tréninky zatím zapisuje trenér, přijde pozvánka na e-mail a po potvrzení se zobrazí v kalendáři (zelená/žlutá). Případně odkaz na „Jak to funguje“.
- Do budoucna: pokud bude obousměrná synchronizace, doplnit návod na povolení přístupu k Google kalendáři.

---

## Ad5) Na mobilu se překrývají možnosti v horní listě

**Stav:** V `components/Header.js` je na menších obrazovkách `nav` s `overflow-x: auto` a `flex-wrap: nowrap` – položky mohou být natlačené nebo se překrývat.

**Návrh řešení (zapracováno v kódu):**
- Na mobilu (např. pod 640px) zmenšit mezery, font-size nebo zobrazit jen ikony + „Profil“ / hamburger menu.
- Konkrétně: upravit breakpointy, přidat dostatečné mezery mezi položkami nebo **hamburger menu** s rozbalovací nabídkou, aby se nic nepřekrývalo.

---

## Ad6) Denní návyky – zlozvyk zaškrtnut = v souhrnu červená (matoucí)

**Problém:** U zlozvyku znamená zaškrtnutí „udělal/a jsem to“ (negativum). V souhrnu se to zobrazuje červeně (zlozvyky), ale buňka při zaškrtnutí je zelená jako u dobrého návyku → dojem, že jsem udělal něco dobrého.

**Návrh řešení (zapracováno v kódu):**  
V `components/HabitTracker.js` u buňky (checkboxu) pro **zlozvyky** při stavu „splněno“ (completed) nepoužívat zelenou, ale **červenou** barvu. Tím bude vizuálně konzistentní s textem v souhrnu („zlozvyků uděláno – čím méně, tím lépe“).

---

## Ad7) Včera jsem zaškrtla návyky, dnes nevidím záznam

**Možné příčiny:**
1. **Časová zóna** – `log_date` se ukládá jako datum (YYYY-MM-DD). Pokud klient zaškrtne „včera“ večer (už po půlnoci lokálně), může být uloženo jiné datum než očekává.
2. **Rozsah načítaných dnů** – HabitTracker načítá `DAYS_BACK = 5` a `DAYS_FORWARD = 2`. Pokud se záznam ukládá správně, měl by být v tomto rozsahu vidět.
3. **Chyba při ukládání** – např. 403 (členství), nebo API vrátí chybu a klient si jí nevšimne.

**Návrh řešení:**
- Ověřit u klientky, že po zaškrtnutí viděla potvrzení (toast „Splněno! ✓“).
- V kódu zkontrolovat: API `/api/habits` vrací po POST uložený `json.log` a rozsah `from`/`to` v GET odpovídá `days` v UI (včetně použití `getLocalDateStr` vs serverové datum).
- Volitelně: přidat do UI u návyků zobrazení „naposledy uloženo“ nebo log pro debugging (jen dev).

---

## Ad8) Neaktualizovat stránku tak často + Objednat suroviny háže error

**Neaktualizovat:**  
Viz **Ad2** – snížit frekvenci automatického refetchu (interval + visibility).

**Objednat suroviny – error:**  
Tlačítko „Objednat suroviny“ v `components/PlanViewer.js` volá `navigator.clipboard.writeText(text)` a pak `window.open('https://www.rohlik.cz/')`.  
- **Clipboard:** V neHTTPS prostředí nebo při odepření oprávnění `writeText` selže (unhandled rejection).  
- **window.open:** Může být zablokováno jako popup.

**Návrh řešení (zapracováno v kódu):**
- Obalit kopírování do **try/catch** a při chybě zobrazit uživatelskou zprávu: „Seznam se nepodařilo zkopírovat – otevři Rohlík.cz a vlož položky ručně ze seznamu níže.“  
- Po kliknutí vždy otevřít Rohlík (nebo nejdřív zkusit kopírování, při selhání stejně otevřít a ukázat zprávu).  
- Případně fallback: zobrazit seznam jako text k ručnímu výběru a kopírování.

---

## Shrnutí – co je hotové v kódu

| AD | Úprava |
|----|--------|
| Ad2 / Ad8 | Prodloužen interval refetchu (30 s → 3 min), visibility refetch až po 60 s neaktivity |
| Ad3 | Výběr cvičících dnů (Po–Ne) v preferencích; uložení do `body_metrics.workout_days`; předání do generování plánu (AI respektuje jen vybrané dny jako tréninkové). Migrace `20260309_body_metrics_workout_days.sql`. Ilustrační obrázky z „Jak to funguje“ – zatím odkaz v textu kalendáře. |
| Ad4 | Do sekce „Kdy mám trénink?“ doplněn krátký vysvětlující text (trenér zapisuje → pozvánka e-mail → zelená/žlutá) + odkaz Jak to funguje. |
| Ad5 | Header na mobilu – úpravy mezery / breakpointy, aby se položky nepřekrývaly. |
| Ad6 | U zlozvyků v habit trackeru při „splněno“ červená barva buňky místo zelené. |
| Ad7 | U sekce Denní návyky doplněna nápověda: „Odškrtnutí se ukládá pro daný den (sloupec). Po uložení uvidíš potvrzení ‚Splněno!‘ – záznam zůstane i další den.“ |
| Ad8 | „Objednat suroviny“ – ošetření chyby clipboardu, uživatelská zpráva při selhání. |

---

## Co zůstává na vás / další krok

- **Ad1:** Získat od klientky screenshot nebo upřesnění místa (kde přesně scroll a duplicita).
- **Ad3 (ilustrace):** Doplnit konkrétní ilustrační obrázky z „Jak to funguje“ do profilu nebo onboardingu (zdroj + umístění).
