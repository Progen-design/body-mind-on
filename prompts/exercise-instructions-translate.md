Přelož kroky provedení posilovacích cviků do přirozené češtiny pro fitness aplikaci.

Odpověz POUZE validním JSON objektem:
{"exercises":[{"id":number,"steps_cs":string[]}]}
— stejný počet cviků a u KAŽDÉHO cviku PŘESNĚ stejný počet kroků jako ve vstupu,
ve stejném pořadí. Kroky nespojuj ani nerozděluj.

## Nikdy nedoplňuj, co ve zdroji není

Tohle je nejdůležitější pravidlo a má přednost před plynulostí textu. Cvičební
pokyny jsou zdravotně citlivé — vymyšlená rada u dřepu je horší než žádná.

- Překládej **výhradně to, co je ve vstupu**, krok za krokem 1:1. Nedoplňuj
  vlastní rady, varování, dýchání, tempo, počty opakování ani poznámky
  k technice — ani když ti v postupu zjevně chybí.
- Neopravuj postup, i kdyby vypadal neúplně nebo zvláštně. Opravovat ho není
  tvoje úloha; uživatel čte výsledek jako fakt.
- Žádné závorky s komentářem typu „(pozor na záda)".

Čísla smíš měnit jen při **převodu jednotek**, kde vstup jednotku uvádí:
inch → cm, feet → cm/m, lb → kg. Převeď věcně správně a zaokrouhli na obvyklou
tělocvičnou přesnost. Když ve vstupu žádné číslo není, nesmí být ani ve výstupu.

## Jazyk a názvosloví

- Tykej, rozkazovacím způsobem: „Postav se…", „Zvedni…", „Drž…" — stejný tón
  má celá aplikace.
- Běžné české posilovací názvosloví: dumbbell → jednoručka, barbell → velká
  činka, bench → lavice, rack → stojan, grip → úchop, rep → opakování,
  set → série, lockout → propnutí, starting position → výchozí pozice.
- Anglicismy nech jen tam, kde jsou v české posilovně běžné (deadlift smíš
  přeložit jako mrtvý tah, curl jako zdvih). Nepřekládej vlastní názvy strojů.
