# Body & Mind ON — produktová analýza

Datum: 9. 9. 2026. Účel: dlouhodobá užitečnost pro běžné uživatele.

## Rozsah a míra jistoty

Analýza vychází z aktuálního lokálního kódu aplikace, produkční přihlašovací obrazovky a zobrazeného třetího kroku registrace. Přihlášené obrazovky zatím nebyly ověřeny v prohlížeči. Implementace funkce není důkaz jejího správného provozu ani jejího přínosu uživatelům. Nebyla analyzována aktuální produkční analytika ani provedena uživatelská studie. Starší interní audity nejsou považovány za důkaz dnešního stavu infrastruktury.

## Produktový směr

Hlavní příležitost: pomáhat lidem rozhodnout, co dnes zvládnou, udělat to a postupně se naučit fungovat samostatně. Hodnotu tvoří proveditelný plán, srozumitelné vysvětlení a přizpůsobení skutečnému životu. Počet metrik a konverzací s AI je podpůrný údaj, nikoli výsledek pro člověka.

Pracovní cílová skupina pro ověření: dospělí s běžným pracovním životem, kteří chtějí pravidelnější pohyb a stravu. Sportovní specialisté mají jiné potřeby; jejich podrobné metriky mohou zůstat v detailech.

## Co již existuje a má cenu zachovat

- Pět hlavních oblastí: Můj profil, Tělo & Váha, Jídelníček & Makra, Tréninkový plán, Regenerace & Spánek (`src/components/NavigationTabs.tsx`).
- Týdenní jídelníček, recepty, nákupní seznam a export (`NutritionSection.tsx`, `RecipeModal.tsx`, `ShoppingListModal.tsx`).
- Tréninkové dny, návody, dostupné lehčí/těžší varianty cviků, časovač a subjektivní obtížnost záznamu (`WorkoutSection.tsx`, `WorkoutLoggerModal.tsx`).
- Ruční měření, historie váhy a integrace zdravotních dat; prázdné stavy rozlišují chybějící měření (`App.tsx`, `BodyCompositionSection.tsx`).
- TED má implementovaný serverový chat s historií a kontextem; lze se ptát z konkrétní metriky či pojmu (`CoachChatModal.tsx`).
- Sdílené výpočty maker a kontrola nesouladu cíle s plánem. To je důležitý základ důvěry.

## Prioritizované nálezy a návrhy

| Priorita | Pozorování v aktuálním kódu / UI | Návrh a přínos |
|---|---|---|
| P1 | Hlavní záložka se jmenuje Můj profil. `App.tsx` vykresluje nejdříve `ProfileSection`, pak přehled jídel. | Posunout hlavní obrazovku k „Dnes“: krátké shrnutí a jeden doporučený další krok. Účet a dlouhodobé nastavení přesunout do sekundárního vstupu. Nevytvářet druhý duplicitní dashboard. |
| P1 | `OverviewBentoGrid.tsx` v aktuální podobě obsahuje jídelníček; tréninkové a regenerační karty jsou odstraněné. | Dnešek má stručně nasměrovat také k plánovanému pohybu, pokud nějaký je. Jeden řádek s akcí stačí; není třeba vracet všechny staré karty. |
| P1 | Kalorie v přehledu jsou součtem odškrtnutých plánovaných jídel; vedle je „% splněno“. | Označit údaj jako „Zaznamenáno z plánu“. Rozlišit nezapsané jídlo, vynechané jídlo a jídlo mimo plán. Neinterpretovat neodškrtnutí jako nulový příjem. |
| P1 | `onAddCustomMeal` je v `NutritionSection` deklarováno, ale nevyužito a `App.tsx` ho nepředává. | Zpřístupnit jednoduché „Jedl/a jsem něco jiného“. Detail kalorií může být volitelný, případný odhad musí být označený. |
| P1 | Existuje `api/daily-checkin.js` s hodnocením a překážkou; v `src` se nenašlo jeho volání. | Navázat krátké dobrovolné hodnocení dne na konkrétní pomoc. Využít existující API; před implementací ověřit datový kontrakt a přístup podle členství. |
| P1 | Plán obsahuje varianty jednotlivých cviků a záznam náročnosti. | Rozšířit úpravy na situace „Mám jen 15 minut“, „Dnes nemohu cvičit“, „Nemám vybavení“. Ukázat návrh změny a nechat jej uživatele přijmout. |
| P2 | Registrace má pět kroků: Účet, Tělo, Trénink, Strava, Návyky. | Změřit, kde lidé odcházejí. Odložit nepodstatné otázky, vysvětlit potřebné údaje a ukázat první užitek co nejdříve. Zachovat omezení potřebná pro vhodnost plánu. |
| P2 | Produkční třetí krok nabízí pohybovou aktivitu jen jako Nízká / Střední / Vysoká, samostatně typ zaměstnání a frekvenci tréninku. | Vysvětlit příklady a zda jde o pohyb mimo trénink. Jinak dva lidé se stejným režimem mohou zvolit odlišnou odpověď. |
| P2 | Rozhraní používá četné popisky 10–12 px, neonové akcenty a vodorovně posuvnou navigaci. | Uklidnit hierarchii, zvětšit důležité texty a ovládací plochy, zkrátit názvy záložek. Mobil ověřit na reálných úkolech. Tmavá identita může zůstat. |
| P2 | Checkbox jídla v přehledu nemá přístupný název; chatový modal v kontrolovaném souboru nemá sémantiku dialogu ani obsluhu Escape. | Doplnit názvy a stavy ovládání, klávesnici, správu fokusu a snížený pohyb. Jde o konkrétní nálezy ze zdroje, nikoli kompletní audit WCAG. |
| P2 | Přihlášení na produkci uvádí „Přihlášení běží přes Supabase Auth. Heslo se nikam neukládá.“ | Odstranit technický detail a nepřesné absolutní tvrzení o heslu. Případné vysvětlení bezpečnosti musí odpovídat skutečnému způsobu zpracování hesel. |

## Jak má vypadat pomoc v běžném dni

Příklad navrhovaného toku, nikoli popis současné funkce:

1. „Dnes máš v plánu trénink. Kolik času máš?“ — 15 / 30 / původní plán.
2. Zobrazit odpovídající návrh s vysvětlením, co se mění. Původní plán zachovat do přijetí změny.
3. Po aktivitě krátká zpětná vazba. Obtížnost už aplikace sbírat umí; navázat na ni.
4. Na konci týdne shrnout skutečně zaznamenané aktivity, chybějící informace a jednu navrženou úpravu.

Člověk bez hodinek má dostat použitelný plán a možnost sdělit, jak se cítí. Nepřipojené zařízení nemá znamenat neúplný produkt. Únava, bolest a zdravotní omezení vyžadují vlastní pravidla; jedno měření nemá automaticky vydávat zdravotní verdikt ani měnit zátěž.

## Nadčasový TED

Každé důležité doporučení by mělo umožnit zjistit: z jakých údajů vzniklo, jak jsou staré, co chybí a co se po přijetí změny stane. Chat může vysvětlit plán; změny plánu potřebují strukturované akce s kontrolou výsledku a možností návratu.

Týdenní shrnutí by mělo spojit „co se povedlo“, „co překáželo“ a „jednu změnu na další týden“. Nezapsaná data se nesmějí zaměnit za nesplnění. Uživatel má mít možnost doporučení odmítnout a určit, zda a kdy chce upozornění.

Součást Mind lze posílit praktickou podporou: realistickým minimem pro náročný den, návratem po pauze bez výčitek a krátkým vysvětlením souvislostí. Úspěchem je i samostatnější uživatel, který aplikaci potřebuje méně často.

## Doporučené pořadí práce

1. Ověřit přihlášený mobilní průchod: první plán, dnešní akce, jiné jídlo, dokončení tréninku, návrat další den. Opravit blokující chyby a zavádějící popisky.
2. Upravit hierarchii hlavní obrazovky a zpřístupnit existující denní zpětnou vazbu. Doplnit jídlo mimo plán.
3. Přidat přijatelné varianty pro nedostatek času a návrat po pauze; propojit je s týdenním shrnutím.
4. Teprve podle výsledků rozšiřovat automatické přizpůsobování a integrace.

Do první etapy bych nezařazoval další skóre, žebříčky, rozsáhlou sociální síť ani více povinného zapisování. Nejprve ověřit přínos základního každodenního průchodu.

## Jak poznat přínos

Nejprve získat výchozí hodnoty; nyní nejsou doložené. Měřit čas k první užitečné akci, dokončení hlavních úkolů bez pomoci, vnímanou proveditelnost plánu, návrat po vynechaném dni a užitečnost přijatých úprav. Retence je doplňková metrika, ne důkaz zlepšení zdraví.

První kvalitativní ověření: 5–8 dospělých s různými zkušenostmi, včetně lidí bez hodinek a lidí s málem času. Nechat je najít dnešní akci, vyřešit odchylku od plánu a vysvětlit zobrazené kalorie vlastními slovy. Následně krátký pilot na 2–4 týdny. Takový pilot poskytne signál o použitelnosti a proveditelnosti, nikoli průkaz klinické účinnosti.

## Externí opora

- [NICE: Behaviour change — digital and mobile health interventions](https://www.nice.org.uk/guidance/ng183/chapter/recommendations): cíle a plánování, sledování, zpětná vazba a podpora jsou relevantní stavební prvky. Konkrétní návrhy v tomto dokumentu jsou produktové hypotézy, nikoli záruka účinku.
- [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/): podklad pro samostatné ověření kontrastu, klávesnice, názvů prvků a velikosti ovládacích cílů. Shoda aplikace nebyla tímto průzkumem prokázána.
