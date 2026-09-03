# Filozofie jídelníčku — zadání a co z něj systém dnes umí

Zadání od Honzy 3. 9. 2026 (dvanáct bodů: kvalitní bílkovina, whole foods,
tuky, sacharidy, zelenina, ultra-zpracované, čas přípravy, meal prep,
funkčnost týdne, personalizace, rozhodovací skóre, hlavní princip),
**upřesněné Honzou tentýž den po prvním měření** — viz sekci
„Rozhodnutá pravidla" níž.

**Tenhle dokument není to zadání znovu.** Je to jeho převod na práci:
co už systém dělá, co je levné, co je drahé a co bez nových dat nejde.
Změřeno na produkci 3. 9. 2026, 835 aktivních receptů a 21 aktivních plánů.

---

## Rozhodnutá pravidla — platí, neotvírat znovu

Honza 3. 9. 2026, po prvním měření katalogu:

1. **Žádné oleje se nezakazují.** Původní bod 3 zadání (vyřadit
   slunečnicový, řepkový, sójový, kukuřičný, margarín) **se neuplatňuje.**
   Důvod: nepatří mezi suroviny, které člověk řeší.
2. **Olivový olej zůstává.** 441 receptů na něm stojí, nechává se být.
   Rozlišovat smažení od studené kuchyně se nebude.
3. **Olej, sůl, pepř a koření se nepočítají mezi suroviny.** Tohle už
   v systému je: `SEASONINGS` v `lib/spoonacular/catalogImportGate.js`
   (22 položek) a `countMainIngredients()` je z počtu odečítá.
4. **Náhražky masa se nevylučují.** Tofu, tempeh a podobné zůstávají —
   28 receptů, u vegetariánské a veganské větve často jediný zdroj
   bílkovin.

Tím padá většina původního bodu 3 a část bodu 6.

---

## A. Už platí — neplatit za to znovu

| bod | stav |
|---|---|
| **7. Do 40 minut** | 804 z 804 receptů, které mají uvedený čas, je **do 40 min**. Import brána to vynucuje (`MEAL_SIMPLICITY_RULES`: snídaně 20, svačina 15, oběd a večeře 30). |
| **2. Jednoduchost** | Průměr **6 surovin** na recept, 504 z 835 má **6 a méně**. |
| **3. Koření se nepočítá** | `SEASONINGS` + `countMainIngredients()` — hotové. |
| **10. Alergie mají přednost** | Dietní brána (`dietaryPublishGate`) je testovaná a nadřazená všemu ostatnímu. |
| **11. Rozhodovací skóre** | `catalogPickRank()` už je přesně tahle myšlenka — váhy pro kalorie, bílkoviny, tuk a jednoduchost. Chybí kritéria, ne struktura. |

Bod 11 je nejlepší zpráva z celého zadání: **nemusí se stavět nový
mechanismus, jen doplnit kritéria do existujícího.**

---

## B. Levné a s velkým efektem — zbyl jeden bod

### Zdroj bílkovin v každém hlavním jídle (bod 1)

**564 z 835 receptů (68 %) má jasný zdroj bílkovin** v surovinách
(maso, ryby, vejce, mléčné výrobky). **271 ho nemá.**

Jde přidat na dvě místa:
- do promptu generátoru receptů — aby nové recepty vznikaly správně,
- do `catalogPickRank()` jako kritérium — aby se při výběru preferovaly.

Zadání říká: *„Každé hlavní jídlo by mělo mít jasný zdroj bílkovin."*
U svačin to platit nemusí, u oběda a večeře ano.

**Pozor na pořadí:** tohle má smysl až po bodu 8.8 (tukový cíl do výroby
receptů). Přidávat kritéria do systému, který ještě neplní ta stávající
(tuk je na 149 % cíle), je ladění na šumu.

---

## C. Drahé — je to přepis jádra, ne ladění

### Meal prep a znovupoužití surovin (body 8 a 9)

**Změřeno: průměrný týdenní plán používá 52 různých surovin** po odečtení
koření, soli a oleje (rozsah 38–70). Se vším dohromady 60.

Zadání říká doslova: *„NEGENERUJ jídelníček, který vyžaduje každý den
nákup a přípravu úplně jiných surovin."* Dnešní plán přesně tohle dělá.

**Proč to není otázka vah.** `resolveMealsFromCatalog` prochází dny
sekvenčně a každé jídlo vybírá izolovaně — `pouzitiZaTyden` se plní až
za pochodu, žádný globální plánovač neexistuje. Aby se dala použít
stejná surovina ve dvou jídlech (kuře z oběda ve večerním salátu), musí
se plán skládat **jako celek**, ne jídlo po jídle.

To je jiná třída úlohy — optimalizace přes celý týden, ne řazení
kandidátů v jednom slotu — a je to nejvýznamnější změna v celém zadání.

**Doporučení: samostatný bod, s návrhem PŘED kódem.** Ne přílepek
k něčemu jinému.

---

## D. Nejde bez dat, která katalog nemá

- **„Kvalitní šunka" vs. „levná uzenina" (bod 6).** Tenhle rozdíl
  v datech není a z názvu se odvodit nedá.
- **Míra průmyslového zpracování** obecně. Buď se doplní jako pole
  do katalogu, nebo zůstane jen jako instrukce v promptu generátoru.

Pro tyhle věci je jediná rozumná cesta **instrukce v promptu generátoru**
(ať nové recepty vznikají správně), ne filtr nad existujícím katalogem.

---

## E. Pořadí prací

1. **8.8 — tukový cíl do výroby receptů.** Běží. Zadání dává v bodě 11
   makra na 2. místo; nemá smysl přidávat nová kritéria do systému,
   který ještě neplní ta stávající. Změřeno: nové recepty mají **45 %
   kalorií z tuku** proti cíli 27–28 %.
2. **Povinný zdroj bílkovin** u hlavních jídel — prompt generátoru
   plus kritérium do skóre.
3. **Znovupoužití surovin** jako samostatný projekt s návrhem před kódem.
4. **Zbytek** (preference druhů zeleniny, filozofie whole foods, „radši
   jednodušší při shodě") patří do promptu generátoru jako priorita,
   ne do kódu jako tvrdá pravidla.

---

## F. Zbývá rozhodnout

**Pořadí z bodu 11 proti dnešnímu chování.** Zadání staví makra až za
individuální omezení a kvalitu surovin nad ně. Dnešní `catalogPickRank`
řeší kalorie, bílkoviny, tuk a jednoduchost — kvalitu surovin vůbec.
Přerovnání vah změní, jak vypadají všechny plány, takže to chce
rozhodnout vědomě, ne mimochodem.
