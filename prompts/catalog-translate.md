Přelož recepty do přirozené češtiny pro fitness aplikaci.

Odpověz POUZE validním JSON objektem:
{"recipes":[{"id":number,"name_cs":string,"ingredient_names_cs":string[],"instructions_cs":string[]}]}
— stejný počet receptů, stejné pořadí surovin a kroků jako ve vstupu.

## Nikdy nedoplňuj, co ve zdroji není

Tohle je nejdůležitější pravidlo a má přednost před plynulostí textu.

- Překládej **výhradně to, co je ve vstupu**. Nedoplňuj chybějící kroky, teploty, časy,
  gramáže ani počty porcí — ani když je postup zjevně neúplný.
- Když postup končí uprostřed věty nebo uprostřed čísla, **přelož jen to, co tam je**,
  a skonči. Nedopisuj konec receptu.
- Nepiš vlastní poznámky, komentáře, opravy ani odhady. Žádné závorky typu
  „(pravděpodobně chyba, mělo by být 175 °C)". Uživatel čte výsledek jako fakt,
  takže tvůj komentář je pro něj k nerozeznání od původního receptu.
- Když je hodnota ve zdroji zjevně špatná, přelož ji tak, jak je. Opravovat ji není
  tvoje úloha.

Čísla smíš měnit jen při **převodu jednotek**, kde vstup jednotku uvádí:
°F → °C, cup → ml, oz → g, lb → kg, inch → cm. Převeď věcně správně a nezaokrouhluj
víc než na obvyklou kuchyňskou přesnost. Když ve vstupu žádné číslo není, nesmí být
ani ve výstupu.

## Název

Přelož do běžné češtiny, ne anglický marketing. Neponechávej anglická slova jako
Powerhouse, superfood, bowl, blend, protein-packed, energy boost apod. — přelož nebo
vynech. Výjimky: „smoothie" a „wrap" můžeš nechat (jsou v češtině běžné). Vlastní
jména (např. Goldilocks) můžeš nechat.

## Suroviny

Běžné české názvy: natural almond butter → mandlové máslo, greek yogurt → řecký
jogurt. `ingredient_names_cs.length` musí odpovídat počtu surovin ve vstupu.

## Dietně kritické výrazy — přívlastek nesmí zmizet

U těchhle surovin rozhoduje o dietě přívlastek, ne základní slovo. Když ho
vynecháš, uděláš z bezlepkové suroviny lepkovou nebo naopak. Překlad se pak
zahazuje automatickou kontrolou, tak ho napiš takhle:

| anglicky | česky | proč |
| --- | --- | --- |
| polenta | kukuřičná polenta | kukuřičná; „krupice“ je pšeničná |
| grits | kukuřičná krupice | bez „kukuřičná“ je z toho pšeničná krupice |
| cornmeal | kukuřičná moučka | „moučka“ sama čte jako pšeničná |
| corn tortilla | kukuřičná tortilla | kukuřičná je bezlepková, pšeničná není |
| buckwheat | pohanka | pohanka není pšenice |
| rice noodles | rýžové nudle | bez „rýžové“ jsou z toho pšeničné |
| quinoa | quinoa | nepřekládat na „obilí“ ani „kroupy“ |
| millet | jáhly | proso je bezlepkové |
| almond flour | mandlová mouka | bez přívlastku pšeničná |
| coconut flour | kokosová mouka | bez přívlastku pšeničná |
| rice flour | rýžová mouka | bez přívlastku pšeničná |
| chickpea flour | cizrnová mouka | bez přívlastku pšeničná |
| oats | ovesné vločky | |
| semolina | pšeničná krupice | holá „krupice“ je nerozlišitelná od kukuřičné |
| flour tortilla | pšeničná tortilla | protějšek kukuřičné |
| couscous | kuskus (pšeničný) | česky to z názvu nepoznáš |
| bulgur | bulgur (pšeničný) | pšeničný |
| cracked wheat | pšeničná lámanka | „lámanka“ sama lepek neprozradí |
| farro | farro (pšeničné zrno) | „farrový“ lepek neprozradí |
| spelt | špalda (pšeničná) | špalda je pšenice |
| barley | kroupy (ječmen) | ječmen nese lepek |
| rye | žitná | žito nese lepek |
| panko | pšeničná strouhanka | „obalený“ lepek neprozradí |
| breadcrumbs | strouhanka | pšeničná |
| english muffin | anglický muffin (pšeničné pečivo) | „vejce Benedikt“ pečivo zamlčí |
| ramen | ramen (pšeničné nudle) | pšeničné nudle |
| udon | udon (pšeničné nudle) | pšeničné nudle |
| seitan | seitan (čistý pšeničný lepek) | seitan JE lepek |

Tohle není doplňování informace, která ve zdroji není — anglický název tu
informaci nese, jen ji čeština bez přívlastku ztrácí.

## Postup

Srozumitelná čeština, zachovej kulinářský styl. Jeden krok vstupu smíš rozdělit do
více kroků výstupu, když je v něm natlačeno několik vět — obsah tím ale nesmí
přibýt ani zmizet.
