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

## 4. Shrnutí

| Cíl | Stav |
|-----|------|
| Ověřit výpočty na profilu | ✅ Konstanty (7700 kcal/kg, kcal/min) jsou v pořádku; doplněno do `docs/PROFIL_VYPOCETY_A_OPENAI.md`. |
| Tlačítko „Objednat suroviny“ | ✅ V PlanViewer: kopírování seznamu + odkaz na Rohlík; odkazy na Košík a Billa e-shop. |
| Integrace typu Billa / Rohlík API | ❌ Veřejné API pro předvyplnění košíku není k dispozici; nutné by bylo partnerství (jako u Goulash). |
