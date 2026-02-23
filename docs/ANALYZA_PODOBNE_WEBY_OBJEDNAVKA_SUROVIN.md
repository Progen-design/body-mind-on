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

## 5. Dostupné služby k napojení systému (bez vlastního B2B)

Můžeš využít **již existující služby**, které nabízejí API pro nákupní seznamy a „add to cart“. Napojení pak není závislé na tom, jestli Rohlík/Košík odpoví na B2B e-mail.

### 5.1 Pepesto (grocery shopping API)

- **Co to je:** Služba, která bere recept nebo textový nákupní seznam, namapuje položky na produkty v obchodech a umožní „add to cart“ / checkout.
- **Web:** [pepesto.com](https://pepesto.com), dokumentace API: [pepesto.com/docs/grocery-shopping-api](https://pepesto.com/docs/grocery-shopping-api).
- **Endpoint:** `/oneshot` – jeden request: vstup (text seznamu nebo URL receptu) → parsing, product matching, vytvoření session → výstupní URL pro checkout.
- **Ceník (orientačně):** cca €2 za request + €0,05 za vstupní položku ([pepesto.com](https://pepesto.com)).
- **Co je potřeba:**  
  - Zaregistrovat se u Pepesta, získat **API klíč**.  
  - Ověřit, zda podporují **ČR** a obchody typu Rohlík/Košík (napsat na [pepesto.com/contact](https://pepesto.com/contact)).  
  - V backendu (např. nový endpoint `POST /api/order-ingredients`): vzít náš `shoppingList` (pole řetězců), poslat ho do Pepesta `/oneshot`, z odpovědi vzít **result URL** a vrátit ji frontendu.  
  - V PlanViewer: tlačítko „Objednat suroviny“ buď otevře tuto URL, nebo nejdřív zkopíruje seznam a pak přesměruje na Pepesto (podle toho, jak Pepesto API funguje – např. „redirect user to this URL to complete checkout“).

**Shrnutí:** Pokud Pepesto podporuje ČR, stačí API klíč + jeden backend endpoint + na frontendu otevřít vrácenou URL.

**E-mail pro support@pepesto.com (šablona):**

```
To: support@pepesto.com
Subject: API integration – Czech Republic (Rohlík/Košík) & partnership inquiry

Hello,

We run Body & Mind ON (https://www.bodyandmindon.cz), a Czech app for personalized nutrition and training. Users receive an AI-generated weekly meal plan including a shopping list (plain text items, e.g. "200 g rice", "1 onion", "broccoli"). We would like to offer a "Order ingredients" button that sends this list to your Grocery Shopping API and redirects the user to checkout (similar to your oneshot flow).

We have a few questions:

1. Do you support the **Czech Republic** and local retailers such as Rohlík.cz or Košík.cz? If not, are you planning to add CZ in the near future?

2. What is the process to get **API access** (keys, documentation) for our use case (server-side: we send the shopping list, you return a checkout/session URL; our frontend opens that URL)?

3. Could you share **pricing** for our expected volume (e.g. pay-per-request or monthly plan)? We are a small but growing app and would like to evaluate integration cost.

Thank you for your time. We are happy to provide more details or jump on a short call if helpful.

Best regards,
[Your name]
Body & Mind ON
[Your email]
```

### 5.2 Whisk (recipe / shopping list → cart)

- **Co to je:** API pro „add recipes to cart“ a nákupní seznamy, propojení s konkrétními maloobchodníky.
- **Dokumentace:** [docs.whisk.com](https://docs.whisk.com) – např. „Add Recipes to Cart“, „Supported Retailers“, „Get Available Stores“.
- **Podpora zemí:** Retailers se berou dle země (např. UK, DE); pro DE je potřeba postal code. **ČR** je potřeba ověřit voláním `GET /v1/retailers` s `country=CZ` (pokud to Whisk umožňuje).
- **Co je potřeba:**  
  - Účet u Whisk, **API credentials**.  
  - Ověřit podporu pro **Czech Republic**.  
  - Náš seznam převést na formát, který Whisk očekává (recept nebo line items), volat jejich cart API, z odpovědi získat odkaz na košík a ten otevřít v prohlížeči.

**Shrnutí:** Vhodné, pokud Whisk v ČR nějaký obchod podporuje; jinak pouze jako rezerva pro jiné trhy.

### 5.3 Rohlík – partner / affiliate odkaz (minimální napojení)

- **Referral program:** [rohlik.cz/referral](https://www.rohlik.cz/referral) – pro koncové zákazníky (splnění 10 nákupů za 12 měsíců), ne pro B2B.
- **Pro partnery:** E-mail **partneri@rohlik.cz** – zeptat se konkrétně na:  
  - „Máte **affiliate / partner odkaz** (URL s ref kódem), který můžeme použít v naší aplikaci při tlačítku ‚Objednat suroviny‘? Uživatel si seznam zkopíruje a na Rohlíku vloží – my bychom jen chtěli odkaz s vaším kódem pro sledování.“  
- **Co to dá:** Žádné předvyplnění košíku, ale pokud ti přidělí odkaz (např. `https://www.rohlik.cz?ref=PARTNER_CODE`), můžeš v PlanViewer při „Objednat suroviny“ otevřít tento odkaz místo holého `https://www.rohlik.cz`. Uživatel pak stejně vloží seznam ručně, ale ty máš napojení na jejich partnerství.

**Shrnutí:** Není to plná integrace, ale využití dostupného kontaktu pro minimální napojení (odkaz s ref).

**E-mail pro partneri@rohlik.cz (šablona):**

```
Komu: partneri@rohlik.cz
Předmět: Partnerství – odkaz z aplikace Body & Mind ON (objednávka surovin)

Dobrý den,

provozujeme aplikaci Body & Mind ON (https://www.bodyandmindon.cz) pro osobní plán výživy a tréninku. Uživatelé u nás dostávají AI jídelníček na míru včetně týdenního nákupního seznamu. V aplikaci máme tlačítko „Objednat suroviny“, které uživateli zkopíruje seznam do schránky a otevře Rohlík.cz – seznam si pak vloží do nákupního seznamu u vás ručně.

Rádi bychom s vámi navázali spolupráci:

1. **Partner / affiliate odkaz** – Máte odkaz s ref kódem (nebo partner ID), který můžeme použít při otevření rohlik.cz z naší aplikace? Šlo by o standardní odkaz, na který uživatel přijde po kliknutí na „Objednat suroviny“. Cílem je správná atribuce a případně podmínky vašeho partnerství.

2. **API / předvyplnění košíku** – Plánujeme do budoucna nabídnout uživatelům možnost přidat seznam do košíku jedním klikem (podobně jako např. aplikace Goulash). Nabízíte API nebo partner program pro tento typ integrace? Pokud ano, na koho se obrátit (obchodní / technické oddělení)?

Děkuji za odpověď. Jsem k dispozici pro doplňující informace nebo krátký hovor.

S pozdravem,
[Vaše jméno]
Body & Mind ON
[E-mail / telefon]
```

### 5.4 Co máš v kódu a co doplnit

- **Teď:** Tlačítko „Objednat suroviny“ kopíruje `parsed.shoppingList` (pole řetězců) do schránky a otevře Rohlík (nebo Košík/Billa).
- **Pokud napojíš Pepesto:**  
  - Backend: např. `pages/api/order-ingredients.js` – přijme `shoppingList`, zavolá Pepesto API, vrátí `{ url: "https://..." }`.  
  - Frontend: pokud je `url` z API, otevřít ji; jinak fallback na stávající chování (copy + rohlik.cz).
- **Pokud napojíš Whisk:** Stejná idea – backend volá Whisk, vrací URL košíku; frontend ji otevře.
- **Pokud Rohlík pošle partner odkaz:** V PlanViewer změnit cílovou URL z `https://www.rohlik.cz/` na jejich odkaz (např. z env `NEXT_PUBLIC_ROHLIK_PARTNER_URL`).

### 5.5 Doporučený postup

| Priorita | Služba | Akce |
|----------|--------|------|
| 1 | **Pepesto** | Kontaktovat Pepesto (contact / demo), zeptat se na podporu **ČR** a ceník pro tvůj objem. Pokud ano – založit účet, API klíč, implementovat `/api/order-ingredients` + otevření jejich URL v PlanViewer. |
| 2 | **Rohlík partneri@rohlik.cz** | Poslat krátký e-mail: že používáš tlačítko „Objednat suroviny“ a otevíráš rohlik.cz; zda mohou poskytnout **partner/affiliate odkaz** pro toto použití. |
| 3 | **Whisk** | Ověřit podporu CZ (GET retailers). Pokud ano – zvážit integraci jako alternativu nebo doplněk k Pepesto. |

Tím využiješ **dostupné služby** (Pepesto, případně Whisk a Rohlík partner odkaz) a nemusíš čekat na vlastní B2B dohodu s Rohlíkem/Košíkem, pokud ji nechceš řešit hned.

---

## 6. Návrh cesty k integraci typu Goulash – co je potřeba (B2B varianta)

Chceš jít cestou Goulash: **předvyplnění košíku / nákupního seznamu u Rohlíku nebo Košíku jedním klikem z Body & Mind ON.** Níže je návrh kroků a checklist.

### 6.1 Cíl

- Uživatel v profilu u plánu klikne **„Objednat suroviny“**.
- Nákupní seznam (položky z AI plánu) se **automaticky přidá do košíku nebo nákupního seznamu** na Rohlíku nebo Košíku (nebo otevře jejich stránku s předvyplněným seznamem).
- Ideálně možnost **přepínat prodejce** (Rohlík / Košík), podobně jako Goulash.

### 6.2 Pořadí kroků (doporučené)

| Krok | Akce | Proč |
|------|------|------|
| 1 | Oslovit **Rohlík** (primární cíl – největší hráč, Goulash s ním spolupracuje) | Nejvyšší šance na existující partner program. |
| 2 | Paralelně nebo po odpovědi oslovit **Košík** | Zvýšíš šanci na dohodu a možnost přepínání prodejce. |
| 3 | Volitelně **Billa** | Menší priorita; e-shop existuje, ale API/partnerství méně ověřené. |

### 6.3 Co je potřeba mít připravené

#### A) Kontakty a kanály

- [ ] **Rohlík** – najít oficiální kontakt pro partnery / B2B (web, LinkedIn, „Pro firmy“, obchodní oddělení). Zkusit např. [rohlik.cz](https://www.rohlik.cz) → patička / „Pro partnery“ nebo vyhledat „Rohlík partner API“ / „Rohlík B2B“.
- [ ] **Košík** – stejně: [kosik.cz](https://www.kosik.cz) → partneři / B2B / obchodní kontakt.
- [ ] Připravit **jednu hlavní kontaktní osobu** z tvé strany (e-mail, telefon), na kterou mohou odpovědět.

#### B) Materiály pro první kontakt (pitch)

- [ ] **Krátký popis produktu** (2–3 věty):  
  *„Body & Mind ON je aplikace pro osobní plán výživy a tréninku. Uživatel po registraci dostane AI jídelníček na míru včetně týdenního nákupního seznamu. Chceme nabídnout možnost přidat tento seznam jedním klikem do košíku / nákupního seznamu u vás (integrace podobná aplikaci Goulash).“*
- [ ] **Co konkrétně žádáš:**  
  *„Máte API nebo partner program pro předvyplnění nákupního seznamu / košíku z externí aplikace? Případně jaké jsou podmínky partnerství pro tento typ integrace?“*
- [ ] **Čísla (pokud máš):** odhad počtu uživatelů, měsíčních aktivních uživatelů nebo plánů za měsíc – B2B často chtějí odhad objemu.
- [ ] **Odkaz na produkt:** [app.bodyandmindon.cz](https://app.bodyandmindon.cz) (nebo landing [bodyandmindon.cz](https://www.bodyandmindon.cz)).

#### C) Technická příprava (až po kladné reakci)

- [ ] **Formát dat:** Nákupní seznam v aplikaci je **seznam textových položek** (např. „200 g rýže“, „1 cibule“, „brokolice“). Připravit popis formátu (JSON nebo prostý text, jeden řádek = jedna položka).
- [ ] **Co budeme schopni poskytnout:** redirect URL s parametrem (např. seznam zakódovaný v URL), nebo server-to-server API volání – podle toho, co partner nabídne.
- [ ] V kódu už máš **parsed.shoppingList** (pole řetězců) v PlanViewer – po dohodě stačí napojit volání jejich API nebo jejich URL schéma.

#### D) Obchodní / právní

- [ ] Být připraven na **smlouvu partnerství** (pokud ji budou vyžadovat).
- [ ] Zjistit, zda partner očekává **revenue share** (podíl z nákupů přes odkaz) nebo **fixní poplatek** – Goulash pravděpodobně má s Rohlíkem/Košíkem nějaký model.

### 6.4 Návrh prvního e-mailu (šablona)

```
Předmět: Partnerství – integrace nákupního seznamu (aplikace Body & Mind ON)

Dobrý den,

provozujeme aplikaci Body & Mind ON (bodyandmindon.cz) pro osobní plán výživy a tréninku. Uživatelé u nás dostávají AI jídelníček na míru včetně týdenního nákupního seznamu.

Rádi bychom nabídli možnost přidat tento seznam jedním klikem do košíku / nákupního seznamu u vás – podobně jako to má aplikace Goulash s Rohlíkem a Košíkem.

Máte prosím API nebo partner program pro tento typ integrace? Případně na koho se obrátit (obchodní / technické oddělení)?

Děkuji za odpověď.

S pozdravem,
[Tvé jméno]
Body & Mind ON
[E-mail / telefon]
```

### 6.5 Shrnutí – checklist „co je potřeba“

| Kategorie | Co je potřeba |
|-----------|----------------|
| **Kontakty** | E-mail nebo formulář pro partnery u Rohlíku a Košíku; jedna jasná kontaktní osoba z tvé strany. |
| **Pitch** | Krátký popis Body & Mind ON, co chceš (API / partner program pro předvyplnění seznamu), odkaz na web/app. |
| **Čísla** | Odhad uživatelů / plánů (volitelné, ale zvyšuje váhu žádosti). |
| **Technicky** | Až po kladné reakci: formát seznamu (pole textů), připravenost napojit jejich API nebo URL. |
| **Obchodně** | Připravenost na smlouvu a případný revenue share / podmínky partnera. |

Jakmile budeš mít od partnera **API dokumentaci nebo URL schéma**, lze v PlanViewer doplnit volání tak, aby tlačítko „Objednat suroviny“ místo jen kopírování otevřelo jejich stránku s předvyplněným seznamem nebo poslalo data do jejich API.

---

## 7. Shrnutí

| Cíl | Stav |
|-----|------|
| Ověřit výpočty na profilu | ✅ Konstanty (7700 kcal/kg, kcal/min) jsou v pořádku; doplněno do `docs/PROFIL_VYPOCETY_A_OPENAI.md`. |
| Tlačítko „Objednat suroviny“ | ✅ V PlanViewer: kopírování seznamu + odkaz na Rohlík; odkazy na Košík a Billa e-shop. |
| Integrace typu Goulash | 📋 Návrh cesty a checklist v sekci 5; další krok = oslovit Rohlík a Košík. |
