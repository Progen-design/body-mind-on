# Analýza konceptu Body & Mind ON a zpětná vazba

*Celkový pohled na koncept, srovnání s podobnými weby a doporučení pro základ, na kterém budeme stavět.*

---

## 1. Současný koncept – stručné shrnutí

**Body & Mind ON** je aplikace pro personalizovaný výživový a tréninkový plán s AI. Nabízí:

- **Registrace (START):** 4 kroky – jméno/e-mail/heslo → tělesné údaje → aktivita/cíl/frekvence → strava a omezení. Po odeslání se vygeneruje AI plán a odešle e-mailem.
- **Profil:** AI plán (jídelníček 7 dní, recepty, nákupní seznam, trénink, mindset), zápis tréninků, sledování pokroku (spálené kcal, odhad váhy), milníky, swap jídel, export jídelníčku, tlačítko „Objednat suroviny“.
- **Landing:** Slibuje denní výzvy, odznaky, mindset, chytré připomínky, týdenní AI doporučení.
- **Ceník:** START 499 Kč/měsíc (7 dní zdarma), ON Club 1 499 Kč, VIP 3 999 Kč.

**Technicky:** Next.js, Supabase (auth + DB), OpenAI (generování plánu), Nodemailer.

---

## 2. Srovnání s podobnými weby / aplikacemi

| Služba | Co dělají | Co mají navíc oproti B&M ON | Co B&M ON dělá lépe / jinak |
|--------|-----------|-----------------------------|-----------------------------|
| **Goulash** (CZ) | Jídelníček, recepty, nákupní seznamy | Přímá integrace Rohlík/Košík (add to cart) | Trénink, mindset, sledování pokroku |
| **Mealime** | Plánování jídel, recepty do 30 min | Grocery delivery integrace, timer u receptů, 200+ personalizací | Česky, trénink, body & mind téma |
| **Meal Plan AI** | AI jídelníček, diety | Hlasové/foto zadání, více diet | Jednodušší flow, trénink |
| **iCook** (CZ) | 1000+ receptů, AI asistent | Velká databáze receptů, AI chatbot | Plán na míru, trénink, mindset |
| **FitAzi** | AI fitness + výživa | 24/7 AI kouč, adaptivní plán každý týden | Česky, jednodušší vstup |
| **Yazio** | Kalorie, AI | 50M+ stažení, silné brand | Zaměření na body & mind |
| **iifym.fit** | Makra, jídelníček | Rychlý swap jídel za sekundy | Komplexní plán (trénink + jídlo) |

### Společné vzory u úspěšných aplikací

1. **Jasná hodnota hned** – uživatel ví během prvních 30 s, co dostane.
2. **Krátký onboarding** – 3–5 kroků, progresivní odhalení, „proč“ u složitějších polí.
3. **Grocery integrace** – nákupní seznam → add to cart nebo alespoň export / copy.
4. **Personalizace viditelná** – „Díky tomu, že jsi vybral vegan, …“.
5. **Jedna hlavní akce po registraci** – např. „Podívej se na dnešní jídlo“ nebo „Zapiš první trénink“.
6. **Adaptace** – plán se mění podle pokroku (týdenní aktualizace, ne jen jednorázový výstup).
7. **Sociální důkaz** – recenze, čísla, příběhy.

---

## 3. Co funguje a na čem stavět

| Oblast | Stav | Poznámka |
|--------|------|----------|
| **4 kroky registrace** | ✅ | Přehledné, ne jeden dlouhý formulář |
| **AI plán** | ✅ | Jídelníček, recepty, nákup, trénink, mindset – kompletní |
| **Profil – plán** | ✅ | PlanViewer, swap, export, nákupní seznam, Objednat suroviny |
| **Tréninky** | ✅ | Zápis, historie, výpočet kcal, odhad váhy |
| **Milníky** | ✅ | Plán připraven, první trénink, týden |
| **E-mail s plánem** | ✅ | Krátký, úderný text |
| **Ceník na landingu** | ✅ | START, Club, VIP – jasná struktura |

**Závěr:** Základ je funkční. Flow registrace → plán → profil dává smysl. Technická implementace je v pořádku.

---

## 4. Rozdíl mezi landingem a realitou

Na landingu se slibuje:

- **„Každý týden dostáváš doporučení od AI trenéra“** – plán se generuje **jednou** po registraci, ne každý týden.
- **„Denní výzvy“** – v aplikaci nejsou denní úkoly/výzvy.
- **„Odznaky & úspěchy“** – milníky existují, ale ne plnohodnotný systém odznaků.
- **„Chytré připomínky“** – nejsou implementované.
- **„AI analyzuje tvůj pokrok a každý týden upravuje plán“** – plán se neaktualizuje automaticky.

**Doporučení:** Buď upravit landing tak, aby odpovídal tomu, co aplikace skutečně dělá, nebo tyto funkce doplnit. Pro „základ“ je důležitější **sladit sliby s realitou** než přidávat nové funkce.

---

## 5. Co chybí oproti konkurenci (základní úroveň)

| Chybějící prvek | Důležitost pro základ | Poznámka |
|------------------|------------------------|----------|
| **Jasná první akce po přihlášení** | Vysoká | Uživatel by měl vědět: „Teď udělej X.“ Např. „Podívej se na dnešní jídlo“ nebo „Zapiš první trénink“. |
| **Sladění landingu s realitou** | Vysoká | Odstranit nebo přeformulovat sliby, které neplníme (denní výzvy, týdenní AI, připomínky). |
| **Hodnota na první pohled** | Střední | Na landingu rychle říct: „Dostaneš jídelníček + trénink na míru za 2 minuty.“ |
| **Grocery integrace** | Střední | Objednat suroviny je – copy + Rohlík. Plná integrace (Pepesto/Rohlík API) je další krok. |
| **Adaptivní plán** | Nižší (pro základ) | Týdenní přegenerování plánu podle pokroku – lze řešit později. |

---

## 6. Doporučení pro základ (co udělat nejdřív)

### 6.1 Sladit landing s realitou ✅

- Odstranit nebo přeformulovat: „denní výzvy“, „chytré připomínky“, „každý týden AI doporučení“.
- Nahradit např.: „Osobní plán na míru“, „Sleduj pokrok a tréninky“, „Mindset tipy v plánu“, „Milníky“.
- FAQ upravit: „Jak funguje AI trenér?“ → odpověď, že plán se generuje po registraci a v profilu ho můžeš upravovat (swap, export).

### 6.2 Jasná první akce po přihlášení ✅

- Banner v profilu pro uživatele bez tréninku: „Tvůj plán je připraven. První krok: zapiš svůj první trénink nebo se podívej na dnešní jídlo v plánu níže.“
- Welcome tour upravena: první krok říká „Podívej se níže na jídelníček a zapiš svůj první trénink“.

### 6.3 Hodnota na landingu – úderná věta ✅

- V hero sekci: „Za 2 minuty máš jídelníček a trénink na míru. Bez trenéra. Bez výmluv.“

### 6.4 Co zatím nechat na později

- Týdenní přegenerování plánu (adaptivní AI)
- Denní výzvy a plnohodnotný systém odznaků
- Chytré připomínky / notifikace
- Hlasové nebo foto zadání
- Skenování jídla

---

## 7. Shrnutí – základ pro další stavbu

| Priorita | Akce | Stav |
|----------|------|------|
| 1 | **Sladit landing s realitou** | ✅ Implementováno |
| 2 | **Jasná první akce po přihlášení** | ✅ Banner + Welcome tour |
| 3 | **Úderná hodnota v hero** | ✅ „Za 2 minuty máš jídelníček a trénink na míru“ |
| 4 | Zachovat současné funkce | Plán, tréninky, swap, export, milníky – solidní základ |

**Závěr:** Koncept Body & Mind ON je smysluplný a technicky v pořádku. Základní úpravy (sladění landingu, jasná první akce, úderná hodnota) jsou implementovány. Na tom lze stavět další funkce (adaptivní plán, denní výzvy, grocery API atd.).

---

*Dokument lze doplňovat po dalších průzkumech nebo po A/B testech.*
