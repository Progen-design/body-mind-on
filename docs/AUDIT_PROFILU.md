# Audit stránky Profil — plán průchodu

Vzniklo 29. 8. 2026 po nasazení 5.9. Cíl: projít každou funkci na profilu,
ověřit ji proti produkčním datům a opravit. Pořadí je podle dopadu na tržby,
ne shora dolů po stránce.

## Čísla z produkce k 29. 8. (neměř je znovu)

```
registrací           9        aktivní členství     1
trialů               3        aktivních plánů      1
body_metrics         4        měření obvodů       49
návyků              37        záznamů návyků      14
tréninků             2        odškrtnutí           2
zpráv trenéra        2        Apple Health       69 payloadů
Withings spojení     1        Withings měření    403
nákupní extra        0        piny jídel           0
progress_tracking    0        nutrition_logs       0
zamčených plánů      0        (locked = true)
```

**Dvě čísla, která rovnou určují úkoly:**

- **9 registrací, ale jen 4 řádky v `body_metrics`.** Pět lidí prošlo
  registrací a nemá tělesné metriky. Buď registrace selhává, nebo je
  nezakládá. To je nejvýš položená otázka celého auditu.
- **`user_meal_pins`, `user_shopping_extras`, `progress_tracking`,
  `nutrition_logs` mají nula řádků.** Buď je nikdo nepoužívá, nebo zápis
  nikdy neproběhne. Audit má rozhodnout které — funkce, do které se nikdy
  nic nezapsalo, je do doby prokázání opaku rozbitá.

## Co na profilu je

Blok `activeTab === 'profil'` v `src/App.tsx` (od ř. 905) vykresluje:

1. `AICoachBanner`
2. `ProfileSection`
3. `TrialPaywallCard` (nové, 5.9)
4. `OverviewBentoGrid`
5. `BodyCompositionSection`
6. `NutritionSection`
7. `WorkoutSection`
8. `BiometricsSection`

## Pořadí průchodu

Jeden blok = jedna session Claude Code, pak `/clear`. Čísla dodává Honzův
druhý Claude předem, Code produkci NEMĚŘÍ.

**A. Zamčený týden se nikdy nevyrobí** — 0 řádků s `locked = true`, takže
paywall z 5.9 dnes nikdo neuvidí. Ověřit, jestli `weekly-plan-producer`
ukázku pro propadlý trial vůbec zakládá, nebo ho brána
`start_trial_allows_initial_plan_only` odřízne dřív. Bez tohohle je celá
5.9 mrtvý kód. **Měří se první, opravuje se první.**

**B. Pět registrací bez tělesných metrik** — projít cestu
registrace → `body_metrics` a najít, kde se ztrácí. Bez metrik nejde
spočítat kalorický cíl, tedy ani plán, tedy ani důvod platit.

**C. `ProfileSection`** — co se zobrazí účtu bez metrik a bez plánu.
Pravidlo `null` je „—", nikdy `0`. Profilová fotka: v hlavičce svítil alt
text místo obrázku (nález z 24. 8., inicály nasazeny v Etapě 4 — ověřit).

**D. `OverviewBentoGrid`** — dlaždice po jedné: odkud bere číslo, co ukáže
při prázdných datech, kam vede proklik. Piny jídel a nákupní extra mají 0
řádků — u obou zjistit, jestli zápis vůbec existuje.

**E. `NutritionSection`** — dva staré nálezy z 3. 8., které nikdo nezavřel:
recept se v týdnu opakuje (vejce 6 ze 7 dní, jednou dvakrát v jednom dni)
a zákazník vidí interní názvy („Krůta s rýží — porce 180/70"). Obojí sráží
ochotu zaplatit víc než cokoli jiného na téhle stránce.

**F. `WorkoutSection`** — 2 tréninky a 2 odškrtnutí na 9 registrací.
Ověřit, jestli se tréninky vůbec zakládají a jestli odškrtnutí přežije
reload.

**G. `BodyCompositionSection`** — 49 měření obvodů proti 4 řádkům
`body_metrics`. Zjistit, co sekce čte a jestli to sedí.

**H. `BiometricsSection`** — Withings jede (403 měření), Apple Health
neodesílá po hodinách, i když karta tvrdí „Odesílá tvůj iPhone každou
hodinu" a „Aktuální" u synchronizace staré 1,5 h. Text má říkat naměřený
odstup, ne záměr.

**I. `AICoachBanner`** — 2 zprávy celkem. Ověřit, co uvidí účet bez zpráv.

## Pravidla průchodu

- Každý blok končí diffem a čekáním na „schvaluji". Bez toho žádný commit.
- Žádná mock data. Když sekce nemá co zobrazit, řeší se prázdný stav,
  ne vymyšlené číslo.
- Nálezy, které nejsou akční, se nezapisují.
- Po každém bloku sem doplnit jednu větu: co se změřilo a co se opravilo.
