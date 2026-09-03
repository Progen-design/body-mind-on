# Filozofie jídelníčku — zadání a co z něj systém dnes umí

Zadání od Honzy 3. 9. 2026 (dvanáct bodů: kvalitní bílkovina, whole foods,
tuky, sacharidy, zelenina, ultra-zpracované, čas přípravy, meal prep,
funkčnost týdne, personalizace, rozhodovací skóre, hlavní princip).

**Tenhle dokument není to zadání znovu.** Je to jeho převod na práci:
co už systém dělá, co je levné, co je drahé a co bez nových dat nejde.
Změřeno na produkci 3. 9. 2026, 835 aktivních receptů a 21 aktivních plánů.

---

## A. Už platí — neplatit za to znovu

| bod | stav |
|---|---|
| **7. Do 40 minut** | 804 z 804 receptů, které mají uvedený čas, je **do 40 min**. Import brána to vynucuje (`MEAL_SIMPLICITY_RULES`: snídaně 20, svačina 15, oběd a večeře 30). |
| **2. Jednoduchost** | Průměr **6 surovin** na recept, 504 z 835 má **6 a méně**. |
| **10. Alergie mají přednost** | Dietní brána existuje (`dietaryPublishGate`), je testovaná a nadřazená všemu ostatnímu. |
| **11. Rozhodovací skóre** | `catalogPickRank()` už je přesně tahle myšlenka — váhy pro kalorie, bílkoviny, tuk a jednoduchost. Chybí kritéria, ne struktura. |

Bod 11 je dobrá zpráva: **nemusí se stavět nový mechanismus, jen doplnit
kritéria do existujícího.**

---

## B. Levné a s velkým efektem

### Zakázané oleje (bod 3)

Změřeno, kolik aktivních receptů je obsahuje:

```
sójový            34
sladidla (sirup, glukóza, fruktóza)   13
slunečnicový       3
řepkový            1
margarín           1
kukuřičný olej     0
--------------------------------
celkem s vyloučeným olejem   45 z 835  (5 %)
```

Pro srovnání: **olivový olej má 441 receptů, ghí nula.** Katalog na
olivovém oleji stojí, což zadání povoluje (za studena) — ale nikde nerozliší,
jestli se na něm smaží.

**Práce:** deaktivovat těch 45 a přidat vyloučení do generátoru receptů.
Půl dne, malé riziko.

### Náhražky masa (bod 6)

**28 receptů** obsahuje tofu, tempeh nebo rostlinnou náhražku. Zadání je
vylučuje — ale pozor, katalog má vegetariánské a veganské diety a tohle
jsou často jediné bílkovinné zdroje pro ně. **Nelze plošně vyřadit, aniž
by se rozbila vegetariánská větev.** Rozhodnutí je produktové, ne technické.

### Zdroj bílkovin v každém hlavním jídle (bod 1)

**564 z 835 receptů (68 %) má jasný zdroj bílkovin** v surovinách
(maso, ryby, vejce, mléčné). 271 ho nemá. Jde to přidat jako kritérium
do generátoru i do skóre.

---

## C. Drahé — je to přepis jádra, ne ladění

### Meal prep a znovupoužití surovin (body 8 a 9)

**Změřeno: průměrný týdenní plán používá 60 různých surovin** (rozsah
43–78 podle plánu).

Zadání říká doslova: *„NEGENERUJ jídelníček, který vyžaduje každý den
nákup a přípravu úplně jiných surovin."* Dnešní plán přesně tohle dělá.

**Proč to není otázka vah.** `resolveMealsFromCatalog` prochází dny
sekvenčně a každé jídlo vybírá izolovaně — `pouzitiZaTyden` se plní až
za pochodu, žádný globální plánovač neexistuje. Aby se dala použít
stejná surovina ve dvou jídlech, musí se plán skládat **jako celek**,
ne jídlo po jídle.

To je jiná třída úlohy (optimalizace přes celý týden, ne řazení kandidátů
v jednom slotu) a je to nejvýznamnější změna v celém zadání.

**Doporučení: samostatný bod, s návrhem PŘED kódem.** Ne přílepek
k něčemu jinému.

---

## D. Nejde bez dat, která katalog nemá

- **„Preferuj ghí / máslo / lůj na tepelnou úpravu" (bod 3).** Katalog
  neví, jaký tuk se používá k úpravě a jaký je složkou. Rozlišit to jde
  jen z postupu, ne ze seznamu surovin.
- **„Kvalitní šunka" vs. „levná uzenina" (bod 6).** Tenhle rozdíl
  v datech není a z názvu se odvodit nedá.
- **Míra průmyslového zpracování** obecně. Buď se doplní jako pole
  do katalogu, nebo zůstane jen jako instrukce v promptu generátoru.

Pro tyhle věci je jediná rozumná cesta **instrukce v promptu generátoru**
(ať nové recepty vznikají správně), ne filtr nad existujícím katalogem.

---

## E. Doporučené pořadí

1. **Dokončit 8.8** (tukový cíl do výroby receptů). Zadání dává v bodě 11
   makra na 2. místo — nemá smysl přidávat osm nových kritérií do systému,
   který ještě neplní ta stávající. Změřeno: nové recepty mají **45 %
   kalorií z tuku** proti cíli 27–28 %.
2. **Levná trojka jedním zásahem do generátoru receptů:** vyloučené oleje,
   ultra-zpracované, povinný zdroj bílkovin u hlavních jídel. Plus
   jednorázová čistka 45 receptů se zakázaným olejem.
3. **Znovupoužití surovin** jako samostatný projekt s návrhem před kódem.
4. **Zbytek** (preference druhů zeleniny, filozofie whole foods, „radši
   jednodušší při shodě") patří do promptu generátoru jako priorita,
   ne do kódu jako tvrdá pravidla.

---

## F. Rozhodnutí, která jsou na Honzovi, ne na mně

- **Náhražky masa.** 28 receptů. Vyloučit je znamená oslabit
  vegetariánskou a veganskou větev. Produktové rozhodnutí.
- **Olivový olej.** 441 receptů na něm stojí. Zadání ho povoluje za
  studena, ale u smažení preferuje ghí. Máme rozlišovat, nebo to nechat?
- **Pořadí z bodu 11 proti dnešnímu chování.** Zadání staví makra až za
  individuální omezení a před kvalitu surovin. Dnešní `catalogPickRank`
  řeší kalorie, bílkoviny, tuk a jednoduchost — kvalitu surovin vůbec.
  Přerovnání vah změní, jak vypadají všechny plány.
