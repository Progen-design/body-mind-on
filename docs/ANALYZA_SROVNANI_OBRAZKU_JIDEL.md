# Analýza: Srovnání obrázků jídel s textem

## Problém

Uživatel vidí nesoulad mezi obrázkem a popisem jídla:
- **Snídaně:** text „Jogurt s ořechy a medem“ → obrázek hamburgeru
- **Oběd:** text „Salát s grilovaným kuřetem a quinoou“ → obrázek správně (kuřecí salát)
- **Večeře:** text „Hovězí pošírované s quinoou“ → obrázek hamburgeru

Všechny nesprávné obrázky mají štítek „Ilustrační foto Pexels“ – tedy pocházejí z Pexels fallbacku, když Spoonacular nenajde přesný match.

---

## Současný flow

1. **Spoonacular** – hledá recept podle českých/anglických kandidátů. Při confidence ≥ 0.75 + obrázek → `trust=exact` (správně).
2. **Pexels fallback** – když Spoonacular nevrací obrázek:
   - Dotaz: `bestQuery` (z Spoonacular) nebo český název + `" food"`
   - Vrací 10 fotek, skóruje podle `photo.alt`
   - Akceptuje první s `score ≥ 2`

## Root cause

1. **Český dotaz pro Pexels** – když Spoonacular nic nenajde, `bestQuery` je null → používá se český text („Jogurt s ořechy a medem“). Pexels má lepší pokrytí pro anglické dotazy.
2. **Slabá filtrace** – pravidlo „ryba → zakázat burger“ existuje, ale chybí „jogurt/snídaně/salát → zakázat burger“.
3. **Nízký práh** – `score ≥ 2` stačí k přijetí. Burger může dostat +4 za „food“, +2 za náhodný token → projde.
4. **Chybějící klíčové slovo** – není požadavek, aby v `alt` byl alespoň jeden hlavní ingredience (jogurt, ořechy, med).
5. **Málo výsledků** – `per_page=10`; Pexels umožňuje až 80.

---

## Doporučení z webu

| Zdroj | Doporučení |
|-------|------------|
| **SnapCalorie, Spike API** | Kombinovat text + obrázek pro lepší match |
| **LogMeal, Bite AI** | Specializované food recognition API s multi-language |
| **Unsplash vs Pexels** | Unsplash má lepší relevance sorting; Pexels má více food fotek |
| **Pexels API** | Normalizovat dotazy, cachovat, `per_page` až 80 |

---

## Řešení (prioritní)

### 1. Použít anglický překlad pro Pexels (když bestQuery chybí)
- Přidat `translateMealQueryToEn()` – už existuje v `mealNormalization.js`
- Pro Pexels dotaz: `bestQuery || translateMealQueryToEn(cleanMealName)` místo `cleanMealName`
- Doplnit překlady: ořechy→nuts, med→honey, pošírované→poached

### 2. Rozšířit pravidla nesouladu (Pexels)
- Jogurt/snídaně/tvaroh/ovesná kaše → zakázat burger, pizza, fries
- Salát → zakázat burger, pizza (částečně už v Spoonacular)
- Hovězí pošírované/dušené → zakázat burger (burger ≠ poached beef)

### 3. Vyžadovat shodu klíčového slova
- Hlavní ingredience = první 2–3 slova dotazu
- Nepřijmout fotku, pokud v `alt` není alespoň jedno z nich

### 4. Zvýšit per_page a práh
- `per_page=20` nebo 30 – více kandidátů
- `minScore` zvýšit na 4–6 – méně falešných matchů

### 5. Volitelně: více Pexels dotazů
- Zkusit např. „yogurt nuts honey“, „yogurt breakfast“ – vybrat nejlepší výsledek

---

## Alternativy (dlouhodobě)

| Možnost | Výhody | Nevýhody |
|---------|--------|----------|
| **Unsplash API** | Lepší relevance | Další API, rate limit |
| **LogMeal / Bite AI** | Food-specific, multi-language | Placené |
| **OpenAI Vision** | Kontrola obrázku vs text | Nákladné, latence |
| **NEXT_PUBLIC_API_ONLY_MEDIA=true** | Žádné špatné Pexels obrázky | Méně obrázků celkově |
