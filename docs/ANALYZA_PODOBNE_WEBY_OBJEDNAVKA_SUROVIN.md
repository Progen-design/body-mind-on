# Analýza podobných webů a objednávka surovin

## 1. Podobné weby / aplikace

| Služba | Co dělají | Objednávka surovin |
|--------|-----------|--------------------|
| **Goulash** (CZ) | Plánování jídel, recepty, nákupní seznamy. Integrace s Rohlík.cz a Košík.cz. | Přímá integrace – seznam lze přidat do košíku u Rohlíku/Košíku, přepínání mezi prodejci. Aplikace má partnerství s těmito řetězci. |
| **Meal Plan AI** (meal-plan.app) | AI jídelníček, diety, nákupní seznamy. | Export seznamu, hlasové/foto zadání. Přímé API pro obchody nebylo v analýze nalezeno. |
| **Kaizen Fit** | AI trénink + jídelníček. | Obvykle export (PDF/TXT) nebo vlastní nákup. |
| **BodyBy.AI** | AI trenérka, jídelníček, skenování jídla. | Sledování pokroku, ne primárně objednávka surovin. |

**Závěr:** Nejblíže má **Goulash** – v ČR přímo propojuje jídelníček s Rohlíkem a Košíkem (včetně přepínání prodejce a doplňování do košíku). Ostatní často končí exportem seznamu nebo manuálním nákupem.

---

## 2. Možnosti u Billa, Rohlíku, Košíku

- **Rohlík.cz** – Nákupní seznamy na webu i v aplikaci; košík, automatické nákupy. **Veřejné API pro třetí strany (předvyplnění košíku / seznamu z externí aplikace) není dostupné.** Integrace typu Goulash vyžaduje pravděpodobně partnerství / B2B dohodu.
- **Košík.cz** – Online nákupy, doručení. **Veřejné API pro koncové zákazníky nebylo v průzkumu nalezeno.** Stejně jako u Rohlíku by plnohodnotná integrace vyžadovala dohodu s provozovatelem.
- **Billa** – Billa e-shop (shop.billa.cz), část nákupů přes partnery (Wolt, foodora). **Žádné veřejné API pro programové předvyplnění košíku nebo seznamu.** Pro integraci by bylo nutné kontaktovat Billa (technická / obchodní oddělení).

Bez partnerství nebo oficiálního API nelze z naší aplikace **automaticky vložit položky do košíku** u Rohlíku, Košíku ani Billa. Realistické je:
- **zkopírovat nákupní seznam do schránky** a
- **otevřít odkaz na e-shop** (Rohlík, Košík, Billa), kde si uživatel seznam vloží nebo vytvoří ručně.

---

## 3. Co máme v Body & Mind ON

V **PlanViewer** (profil) je u bloku „Nákupní seznam na týden“:

- **Tlačítko „Objednat suroviny“** – zkopíruje seznam do schránky a otevře Rohlík.cz v novém okně.
- **Text s odkazy** na Rohlík.cz, Košík.cz a Billa e-shop – uživatel může seznam vložit (Ctrl+V) v nákupním seznamu nebo při nákupu na kterékoliv z těchto stránek.

Tím je objednávka surovin „zajištěna“ v režimu **copy + odkaz**; plné „jedním klikem do košíku“ by vyžadovalo dohodu s jedním z prodejců (podobně jako Goulash).

---

## 4. Jak nastavit integraci typu Goulash (Rohlík / Košík)

Goulash má s Rohlíkem a Košíkem **partnerství** – uživatelé mohou seznam z aplikace přidat přímo do košíku a přepínat mezi prodejci. U nás to bez B2B dohody nejde; níže je, jak se k tomu dostat.

### 4.1 Co máš teď (bez nastavování)

- V profilu u plánu je tlačítko **„Objednat suroviny“** – zkopíruje nákupní seznam a otevře Rohlík.
- Odkazy na Rohlík.cz, Košík.cz a Billa e-shop jsou v textu pod tlačítkem.
- **Není potřeba nic nastavovat** – po deployi to funguje. Uživatel vloží seznam (Ctrl+V) v Rohlíku/Košíku/Billa ručně.

### 4.2 Jak získat integraci „jako Goulash“ (předvyplnění košíku)

Plnohodnotná integrace = **B2B / partnerství** s Rohlíkem nebo Košíkem. Postup:

1. **Rohlík.cz**
   - Web: [www.rohlik.cz](https://www.rohlik.cz) → v patičce nebo „Pro firmy“ / „Pro partnery“ (pokud je odkaz).
   - Kontakt: Obecně **obchodní oddělení** nebo **partner@rohlik.cz** (nebo ekvivalent na jejich stránce).
   - Napsat stručně: že provozuješ aplikaci Body & Mind ON (jídelníček na míru), uživatelé mají nákupní seznam a chtěli byste nabídnout možnost **přidat seznam do košíku / nákupního seznamu na Rohlíku** (integrace typu Goulash). Zeptat se, zda mají **API nebo partner program pro tento typ integrace**.

2. **Košík.cz**
   - Web: [www.kosik.cz](https://www.kosik.cz) → sekce pro partnery / B2B (pokud existuje).
   - Kontakt: **Obchodní nebo technické oddělení** – stejná idea: popsat aplikaci, nákupní seznamy a zájem o integraci (předvyplnění seznamu/košíku).

3. **Billa**
   - E-shop: [shop.billa.cz](https://shop.billa.cz).
   - Pro API/integraci: kontaktovat **Billa** přes oficiální kontakt na webu (obchodní/technické oddělení) a zeptat se na možnost partnerství pro předvyplnění nákupu z externí aplikace.

### 4.3 Co mít připravené pro jednání

- Krátký popis produktu (Body & Mind ON, kdo jsou uživatelé, jak vzniká nákupní seznam).
- Co přesně chceš: např. „Odkaz nebo API, které umožní předvyplnit nákupní seznam / košík z naší aplikace (jako u Goulash).“
- Počet uživatelů nebo odhady (pokud máš) – pro B2B často chtějí odhad objemu.

### 4.4 Shrnutí nastavení

| Chceš | Co udělat |
|-------|-----------|
| Používat současné tlačítko a odkazy | Nic nenastavovat – po deployi je to v produkci. |
| Integraci „jako Goulash“ (do košíku jedním klikem) | Kontaktovat Rohlík a Košík (a případně Billa) s návrhem partnerství a požadavkem na API / partner program. |

---

## 5. Shrnutí

| Cíl | Stav |
|-----|------|
| Ověřit výpočty na profilu | ✅ Konstanty (7700 kcal/kg, kcal/min) jsou v pořádku; doplněno do `docs/PROFIL_VYPOCETY_A_OPENAI.md`. |
| Tlačítko „Objednat suroviny“ | ✅ V PlanViewer: kopírování seznamu + odkaz na Rohlík; odkazy na Košík a Billa e-shop. |
| Integrace typu Billa / Rohlík API | ❌ Veřejné API pro předvyplnění košíku není k dispozici; nutné by bylo partnerství (jako u Goulash). |
