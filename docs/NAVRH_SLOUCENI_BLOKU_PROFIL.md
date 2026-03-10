# Návrh sloučení bloků na stránce Profil

## Současný stav (10 bloků pro klienta)

| # | Blok | Obsah |
|---|------|--------|
| 1 | Tvé milníky | Checklist: plán připraven, první trénink, týden s námi |
| 2 | Mindset na tento týden | Citát, focus, výzva z AI plánu |
| 3 | Kdy mám trénink? | Kalendář týdne (plánované tréninky) |
| 4 | Denní návyky | Habit tracker + souhrn návyků |
| 5 | Jídelníček a tréninkový plán | Aktuální týdenní plán (PlanViewer) |
| 6 | Náhled příštího týdne | Příští týden (PlanViewer) |
| 7 | Historie tréninků | Seznam zapsaných tréninků |
| 8 | Statistiky | KPI: tréninky tento týden/celkem, minuty, kcal, odhad váhy |
| 9 | Vývoj váhy | Graf odhadu váhy z tréninků |
| 10 | Tvůj progres | Období, celkem tréninků/minut/kcal, trend, váha |

---

## Analýza – co jde logicky dohromady

- **Plán:** „Jídelníček a tréninkový plán“ a „Náhled příštího týdne“ jsou oba PlanViewer, jen jiný týden → jeden blok s přepínačem **Tento týden / Příští týden**.
- **Čísla a grafy:** „Statistiky“, „Vývoj váhy“ a „Tvůj progres“ jsou všechny přehled výkonu a pokroku (KPI, graf, trend) → jeden blok **Statistiky a progres** s podsekcemi.
- **Motivace / úvod týdne:** „Tvé milníky“ a „Mindset na tento týden“ jsou krátké, motivující; lze sloučit do **Tvůj týden** (nahoře milníky, dole mindset).
- **Tréninky:** „Kdy mám trénink?“ (kalendář) a „Historie tréninků“ (záznamy) – oba o trénincích; možné sloučit do **Tréninky** (v bloku záložky Kalendář / Historie).
- **Denní návyky:** jiná doména (návyky vs. plán/trénink), doporučení **nechat samostatně**.

---

## Návrh řešení

### Varianta A – 6 bloků (doporučená)

| Nový blok | Co sloučit | Jak zobrazit |
|-----------|------------|--------------|
| **1. Tvůj týden** | Tvé milníky + Mindset na tento týden | Jedna bublina: nahoře checklist milníků, pod ním mindset (citát, focus, výzva). |
| **2. Kdy mám trénink?** | beze změny | Kalendář týdne. |
| **3. Denní návyky** | beze změny | Habit tracker. |
| **4. Můj plán** | Jídelníček a tréninkový plán + Náhled příštího týdne | Jedna bublina s přepínačem (tabs): „Tento týden“ / „Příští týden“. Každá záložka = PlanViewer pro daný plán. |
| **5. Tréninky** | Historie tréninků + (volitelně zkráceně Kdy mám trénink?) | Jedna bublina s tabs: „Kalendář“ (stávající Kdy mám trénink?) a „Historie“ (seznam zapsaných). Nebo jen Historie a Kalendář nechat samostatně – viz varianta B. |
| **6. Statistiky a progres** | Statistiky + Vývoj váhy + Tvůj progres | Jedna bublina s podsekcemi nebo tabs: „Přehled“ (KPI), „Vývoj váhy“ (graf), „Progres“ (období, trend, váha). |

**Výsledek:** 10 → 6 bloků.

---

### Varianta B – 5 bloků (větší zjednodušení)

Stejné jako A, ale **Tréninky** = pouze Historie tréninků (bez slučování s kalendářem), a **Kdy mám trénink?** zůstane samostatně:

1. **Tvůj týden** (milníky + mindset)  
2. **Kdy mám trénink?** (kalendář)  
3. **Denní návyky**  
4. **Můj plán** (tento týden / příští týden)  
5. **Tréninky a progres** = Historie tréninků + Statistiky + Vývoj váhy + Tvůj progres v jednom bloku s tabs: „Historie“ | „Přehled“ (KPI) | „Vývoj váhy“ | „Progres“.

**Výsledek:** 10 → 5 bloků.

---

### Varianta C – 7 bloků (menší zásah)

Pouze nejsilnější sloučení:

1. **Tvé milníky** (beze změny)  
2. **Mindset na tento týden** (beze změny)  
3. **Kdy mám trénink?** (beze změny)  
4. **Denní návyky** (beze změny)  
5. **Můj plán** = Jídelníček a tréninkový plán + Náhled příštího týdne (tabs)  
6. **Historie tréninků** (beze změny)  
7. **Statistiky a progres** = Statistiky + Vývoj váhy + Tvůj progres (jedna bublina, vnitřní sekce/tabs)

**Výsledek:** 10 → 7 bloků.

---

## Doporučení

- **Implementačně nejčistší:** Varianta C (sloučit jen plán a „čísla + graf + progres“).
- **Nejvíce zjednodušené menu:** Varianta B (5 bloků).
- **Kompromis:** Varianta A (6 bloků) – sloučení plánu, tréninků (kalendář + historie), statistik a motivace (milníky + mindset).

Technicky: v `profil.js` zůstanou sekce (kvůli scrollování a přístupnosti), ale místo 10 bublin se zobrazí 5–7 bublin; uvnitř sloučených bublin přidat jednoduché tabs (state např. `planTab: 'current' | 'next'`, `statsTab: 'overview' | 'weight' | 'progress'`) a vykreslit příslušný obsah podle aktivní záložky.
