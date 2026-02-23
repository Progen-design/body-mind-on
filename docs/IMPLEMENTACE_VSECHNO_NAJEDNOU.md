# Implementace „všechno najednou“ – plán pro celý projekt a úpravy GPT asistenta

*Konkrétní mapování na kód a instrukce pro úpravu Asistenta GPT.*

**Implementováno (celý balík):**
- **Onboarding po krocích + „proč“** – `pages/start.js`: 4 kroky, progress bar, texty „proč“ u Aktivity, Cíle a Strava a omezení.
- **Milníky** – `pages/profil.js`: blok „Tvé milníky“ (Plán připraven, První trénink, Týden s námi); API `profile` vrací `user.created_at`.
- **Poslat plán znovu** – `pages/api/send-plan-again.js` + tlačítko v profilu; toast po odeslání.
- **Nákupní seznam a Mindset** – SYS v `lib/generatePlan.js`, parsování a UI v `PlanViewer.js`; fallback nákupního seznamu ze surovin v receptech.
- **Swap jídla** – v `PlanViewer.js` tlačítko „Nahradit jiným“ u každého jídla, modal s alternativou z `/api/recipe`, tlačítko „Nahradit toto jídlo v plánu“ (lokální state).
- **Export jídelníčku** – tlačítko „Stáhnout jídelníček (týden)“ v `PlanViewer.js`, stažení TXT z `parsed.days` (+ overrides).
- **Motivační zpráva po tréninku** – v profilu po uložení tréninku toast: „Trénink úspěšně přidán! Dobrý krok – každý trénink se počítá.“
- **Ceník / hodnota na landingu** – v `pages/index.js` blok s textem „Osobní plán + jídelníček + trénink – od 499 Kč/měsíc. Místo tisíců za osobního trenéra…“ a CTA.

---

## Přehled: co se kde mění

| # | Funkce | Soubory / místa | GPT (generatePlan) |
|---|--------|------------------|---------------------|
| 1 | Onboarding po krocích + „proč“ | `pages/start.js` | — |
| 2 | Milníky v profilu | `pages/profil.js`, příp. komponenta | — |
| 3 | Nákupní seznam | `components/PlanViewer.js`, parsování plánu | Ano – nová sekce v SYS |
| 4 | Poslat plán znovu | `pages/profil.js`, `pages/api/send-plan-again.js` (nový), `lib/mail.js` | — |
| 5 | Výměna jídla (swap) | `components/PlanViewer.js`, `pages/api/recipe.js` nebo nový endpoint | Volitelně (API receptu stačí) |
| 6 | Export jídelníčku | `components/PlanViewer.js`, stáhnout text/PDF | — |
| 7 | Mindset prvek v UI | `components/PlanViewer.js`, parsování plánu | Ano – nová sekce v SYS |
| 8 | Motivační zpráva po akci | `pages/profil.js` (po uložení tréninku) | — |
| 9 | Ceník / hodnota na landingu | `pages/index.js` | — |

---

## 1. Onboarding po krocích + „proč“ u polí

**Kde:** `pages/start.js`

**Co udělat:**
- Rozdělit stávající formulář na **3–4 kroky** (např. krok 1: Jméno, e-mail, hesla; krok 2: Pohlaví, věk, výška, váha; krok 3: Aktivita, stres, typ práce, cíl, frekvence; krok 4: Strava a omezení).
- Stav: `const [step, setStep] = useState(1)`, max step 4. Na konci každého kroku tlačítko „Pokračovat“ (ne „Dokončit“), na posledním kroku „Dokončit registraci“.
- **Progress bar** nahoře: např. `step / 4` (vizuálně pruh nebo kolečka).
- **„Proč“ u polí:** Pod nebo vedle labelu přidat krátký text (malým písmem, šedá) jen u vybraných polí:
  - **Aktivita:** „Pomůže nám nastavit denní kalorie a intenzitu tréninku.“
  - **Cíl:** „Podle cíle upravíme kalorie a makra (redukce / udržení / nárůst).“
  - **Strava a omezení (sekce):** „Abychom do jídelníčku nezařadili to, co nejíš.“

Validace: povinná pole lze kontrolovat jen v rámci aktuálního kroku, nebo až při odeslání (podle preference).

---

## 2. Milníky v profilu

**Kde:** `pages/profil.js`

**Co udělat:**
- Přidat blok **„Tvé milníky“** (např. nad nebo pod plán). Tři položky:
  - **Plán připraven** – splněno, pokud uživatel má alespoň jeden plán (`currentPlan`).
  - **První trénink** – splněno, pokud `workouts.length > 0`.
  - **Týden s námi** – splněno, pokud od registrace / prvního přihlášení uplynulo ≥ 7 dní (potřeba datum registrace nebo první aktivita – lze vzít z `profile.created_at` nebo prvního plánu).
- Zobrazení: tři karty nebo tři řádky s ikonou ✓ (splněno) / ○ (ještě ne) a krátký text.
- Data: `profile`, `currentPlan`, `workouts` už v profilu jsou; pro „týden s námi“ použít `profile?.created_at` z API nebo přidat do `/api/profile` vrácení `created_at` (pokud už tam je, jen ho zobrazit).

---

## 3. Nákupní seznam z receptů

**Kde:**  
- **GPT (generatePlan):** rozšířit SYS o sekci Nákupní seznam (viz sekce „Úpravy GPT“ níže).  
- **Parsování:** `components/PlanViewer.js` – v `parsePlanHtml` přidat vyhledání sekce `h3` obsahující „Nákupní seznam“ a z ní vyčíst `<ul><li>...</li></ul>` do `result.shoppingList = ['položka1', ...]`.  
- **UI:** V `PlanViewer` přidat sekci „Nákupní seznam“ (např. pod Recepty): tlačítko „Zobrazit nákupní seznam“ nebo přímo seznam; pokud GPT nákupní seznam nevrátí, sestavit ho z receptů – z každého `r.content` vybrat blok „Suroviny:“ a rozdělit na řádky, sloučit a odduplikovat (jednoduchá heuristika).

**Doporučení:** V prvním kroku stačí **sestavit nákupní seznam z receptů na straně klienta** (parsovat suroviny z `parsed.recipes[].content`). Úprava GPT může přijít až jako vylepšení (čistší seznam, množství).

---

## 4. Poslat plán znovu

**Kde:**  
- **API:** Nový endpoint `pages/api/send-plan-again.js`. Metoda POST, vyžaduje přihlášení (session). Načte aktuální plán pro uživatele (z `ai_generated_plans` nebo z `body_metrics` + znovu generovat – podle toho, co chcete). Zavolá `sendPlanEmail(email, planHtml, opts)` z `lib/mail.js` (bez nového hesla, jen „poslat plán znovu“).  
- **Profil:** V `pages/profil.js` přidat tlačítko „Poslat plán znovu na e-mail“. Po kliknutí volat `fetch('/api/send-plan-again', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token } })`. Zobrazit toast „Plán byl odeslán na tvůj e-mail.“

**Pozn.:** Pokud plán ukládáte v `ai_generated_plans`, endpoint načte `plan_html` a pošle ho mailem. Pokud ne, musí buď plán znovu vygenerovat, nebo uložit plán při první generaci tak, aby šel znovu poslat.

---

## 5. Výměna jídla (swap)

**Kde:** `components/PlanViewer.js`

**Co udělat:**
- U každého jídla v jídelníčku (u karty jídla) přidat tlačítko „Nahradit jiným“.
- Po kliknutí: otevřít modal nebo dropdown s možnostmi: (1) „Vygenerovat jiné jídlo“ – zavolá stávající `/api/recipe?dish=...` s textem typu „snídaně do 400 kcal“ / „oběd bez lepku“ podle kontextu; (2) případně výběr z předpřipravených alternativ (až později).
- Po obdržení HTML z API zobrazit recept v modalu a **nahradit v UI** dané jídlo za nový název + text (lokální state v komponentě, bez ukládání do DB v první verzi). Případně jen „Zobrazit alternativu“ bez přepisování plánu.

**GPT:** Stačí stávající endpoint receptu; volání může být např. `dish=alternativa k obědu, bez lepku, do 500 kcal`. Rozšíření GPT v generatePlan pro swap není nutné.

---

## 6. Export jídelníčku

**Kde:** `components/PlanViewer.js`

**Co udělat:**
- Přidat tlačítko „Stáhnout jídelníček (týden)“.
- Z `parsed.days` sestavit text: pro každý den název dne + pod ním jídla (typ + text). Formát např. plain text nebo HTML.
- Stáhnout jako soubor: `blob` + `URL.createObjectURL` + `<a download="jidelnicek.txt">` (nebo `.html`). Pro PDF lze použít knihovnu (např. jsPDF) nebo v první verzi jen text.

---

## 7. Mindset prvek v UI

**Kde:**  
- **GPT (generatePlan):** rozšířit SYS o sekci „Mindset na tento týden“ (viz níže).  
- **Parsování:** V `parsePlanHtml` přidat vyhledání např. `h3` obsahující „Mindset“ (nebo „Regenerace & Mindset“) a z následujícího `<p>` nebo prvního odstavce vzít jednu větu do `result.mindsetTip`.  
- **UI:** V `PlanViewer` zobrazit nad nebo pod jídelníčkem blok: „💙 Mindset na tento týden: [věta].“

**Alternativa bez úpravy GPT:** Pevná sada vět (pole 5–10 vět) a zobrazit náhodnou nebo podle dne v týdnu.

---

## 8. Motivační zpráva po akci

**Kde:** `pages/profil.js`

**Co udělat:**
- Po úspěšném uložení tréninku (kde teď voláte např. `setToast` nebo aktualizujete seznam) zobrazit krátkou motivační zprávu: např. „Dobrý krok! Každý trénink se počítá.“ nebo „Výborně, zapsáno. Zítra můžeš znovu.“
- Stačí přidat do stávajícího toastu text nebo druhý řádek; nebo zobrazit malý bublina pod tlačítkem „Zapsat trénink“.

---

## 9. Ceník / hodnota na landingu

**Kde:** `pages/index.js`

**Co udělat:**
- Přidat blok (sekci) s cenou a hodnotou: např. „Osobní plán + jídelníček + trénink – za cenu X. Místo tisíců za osobního trenéra.“
- Konkrétní text a čísla podle vašeho ceníku; CTA tlačítko směřující na `/start` nebo na ceník.

---

## 10. Úpravy GPT asistenta (generatePlan) – Body & Mind ON plán

**Soubor:** `lib/generatePlan.js` – konstanta **SYS** (system prompt).

**Cíl:** Aby výstup plánu obsahoval struktury, které aplikace umí vyparsovat a zobrazit (nákupní seznam, mindset věta). Formát zůstává čistý HTML bez markdownu.

### 10.1 Přidat do SYS (za sekci Recepty, před Tréninkový plán)

```text
<h3>Nákupní seznam na týden</h3>
<p>Jeden sloučený seznam surovin pro všechny recepty na tento týden. Každá položka na nový řádek, s množstvím pokud je to rozumné (např. 200 g rýže, 1 ks cibule). Formát: <ul><li>položka 1</li><li>položka 2</li></ul>. Bez duplicit, běžné suroviny (sůl, olej) na konci.</p>

<h3>Mindset na tento týden</h3>
<p>Jedna krátká motivační nebo zklidňující věta pro klienta na tento týden (1–2 věty). Téma: odpočinek, trpělivost, malé kroky, tělo a mysl. Piš do jednoho odstavce <p>...</p>.</p>
```

- V **parsování** (`parsePlanHtml` v PlanViewer):
  - Pro **Nákupní seznam:** najít `h3` jehož text obsahuje „Nákupní seznam“, pak najít následující `ul` a z `li` vybrat text do pole `result.shoppingList`.
  - Pro **Mindset:** najít `h3` obsahující „Mindset na tento týden“, pak následující `p` a jeho text uložit do `result.mindsetTip`.

### 10.2 Zachovat v SYS

- Respektování **diet_type** a **preferences** (už v buildUserPrompt).
- Struktura **Recepty** s `<b>Suroviny:</b>` a `<b>Postup:</b>` – z toho jde případně odvodit nákupní seznam na klientu, pokud GPT sekci Nákupní seznam nevyplní.
- **Regenerace & Mindset** – stávající blok může zůstat; „Mindset na tento týden“ je jedna věta navíc pro UI.

### 10.3 User prompt (buildUserPrompt)

- Přidat do instrukce jednu větu:  
  „Do výstupu zařaď sekci Nákupní seznam na týden (sloučené suroviny z receptů) a sekci Mindset na tento týden (jedna motivační věta).“

---

## 11. Druhý GPT asistent (metriky / JSON)

Pokud máte **samostatného GPT asistenta** (např. ten, který vrací JSON s `bmr`, `tdee`, `calories`, `protein_g`, `html` atd.):

- **Synchronizace s plánem:**  
  - Stejná logika **diet_type** (standard | vegetarian | vegan) a **preferences** (řetězec).  
  - V JSON výstupu nic měnit nemusíte; vstup už má `diet_type` a `preferences`.  
- **Rozšíření výstupu (volitelně):**  
  - Pokud tento asistent generuje i kus HTML plánu, můžete u něj stejně požádat o **jednu větu mindset** (např. pole `mindset_tip`) a **nákupní seznam** (pole `shopping_list` jako pole řetězců). Pak je nemusíte parsovat z HTML v hlavním plánu.

**Shrnutí pro druhého asistenta:**  
- Vstup: `diet_type`, `preferences` (už máte).  
- Výstup: případně přidat `mindset_tip` (string) a `shopping_list` (array of strings), aby aplikace mohla zobrazit „všechno najednou“ i když plán pochází z tohoto endpointu.

---

## 12. Pořadí implementace v kódu (doporučené)

1. **Onboarding po krocích + „proč“** (`start.js`) – vstupní zážitek.
2. **Úpravy SYS a parsování** (`generatePlan.js` + `PlanViewer.js`) – nákupní seznam a mindset z plánu; v PlanViewer rozšířit `parsePlanHtml` a zobrazit bloky.
3. **Milníky** (`profil.js`) – rychlé, jen čtení dat.
4. **Poslat plán znovu** (`api/send-plan-again.js` + tlačítko v profilu).
5. **Nákupní seznam v UI** – pokud GPT sekci nevrátí, fallback: sestavit ze surovin v receptech v `PlanViewer`.
6. **Export jídelníčku** (tlačítko + funkce v PlanViewer).
7. **Swap** (tlačítko u jídla + volání `/api/recipe` s kontextem).
8. **Motivační zpráva po tréninku** (toast v profilu).
9. **Ceník na landingu** (`index.js`).

---

## 13. Kontrolní seznam před nasazením

- [x] Registrace: všechny kroky se dají projít, data se odešlou stejně jako dnes.
- [x] Po přihlášení: zobrazí se milníky, plán, recepty, nákupní seznam (nebo fallback), mindset věta.
- [x] Tlačítko „Poslat plán znovu“ odešle e-mail.
- [x] Export jídelníčku stáhne soubor.
- [x] Swap u jídla otevře modal s alternativou.
- [x] Po zapsání tréninku se zobrazí motivační zpráva.
- [x] GPT: nový plán obsahuje sekce Nákupní seznam a Mindset na tento týden; parsování je na ně napojené.

---

*Tento plán navazuje na [VYHODNOCENI_A_PRISTUP_DALE.md](./VYHODNOCENI_A_PRISTUP_DALE.md) a mapuje „všechno najednou“ na konkrétní soubory a úpravy včetně Asistenta GPT.*
