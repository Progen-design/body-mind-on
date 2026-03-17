# Nastavení API pro obrázky jídel a cviků

Pro zobrazení obrázků v jídelníčku a tréninkovém plánu potřebuješ nastavit 3 externí API. Bez nich se zobrazí „Bez ověřeného obrázku“.

---

## 1. Spoonacular (obrázky jídel, recepty)

**Zdroj:** [spoonacular.com/food-api](https://spoonacular.com/food-api/console#Dashboard)

### Možnost A: Přímý API klíč (doporučeno)
1. Zaregistruj se na [spoonacular.com](https://spoonacular.com/food-api)
2. Získej API klíč v Profile → API Key
3. Vercel → Settings → Environment Variables:
   ```
   SPOONACULAR_API_KEY=tvuj-api-klic
   ```

### Možnost B: Přes RapidAPI
1. [RapidAPI Spoonacular](https://rapidapi.com/apidojo/api/spoonacular) – subscribe (free tier)
2. Získej `X-RapidAPI-Key` z RapidAPI dashboard
3. Vercel env:
   ```
   RAPIDAPI_KEY=tvuj-rapidapi-key
   RAPIDAPI_SPOONACULAR_HOST=spoonacular-recipe-food-nutrition-v1.p.rapidapi.com
   ```

---

## 2. ExerciseDB (GIF cviků)

**Zdroj:** [RapidAPI ExerciseDB](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)

1. Otevři [RapidAPI ExerciseDB](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)
2. Subscribe (free tier)
3. Z RapidAPI dashboard zkopíruj `X-RapidAPI-Key`
4. Zjisti host – v dokumentaci API (Endpoints) uvidíš např. `exercisedb.p.rapidapi.com`
5. Vercel env:
   ```
   RAPIDAPI_KEY=tvuj-rapidapi-key
   EXERCISEDB_API_HOST=exercisedb.p.rapidapi.com
   ```
   Nebo pokud máš separátní klíč:
   ```
   EXERCISEDB_API_KEY=tvuj-rapidapi-key
   EXERCISEDB_API_HOST=exercisedb.p.rapidapi.com
   ```

> **Poznámka:** Jeden `RAPIDAPI_KEY` platí pro všechny RapidAPI API (Spoonacular, ExerciseDB). Stačí ho nastavit jednou.

---

## 3. Pexels (ilustrační obrázky – fallback)

**Zdroj:** [pexels.com/api](https://www.pexels.com/cs-cz/api/key/)

1. Zaregistruj se na [pexels.com](https://www.pexels.com/cs-cz/api/)
2. Získej API klíč
3. Vercel env:
   ```
   PEXELS_API_KEY=tvuj-pexels-api-key
   ```

---

## Shrnutí env proměnných

| Proměnná | Povinné | Popis |
|----------|---------|-------|
| `SPOONACULAR_API_KEY` | Jídla | Přímý klíč ze spoonacular.com |
| `RAPIDAPI_KEY` | Jídla/cviky | Klíč z RapidAPI (pro Spoonacular + ExerciseDB) |
| `RAPIDAPI_SPOONACULAR_HOST` | Volitelné | Výchozí: spoonacular-recipe-food-nutrition-v1.p.rapidapi.com |
| `EXERCISEDB_API_HOST` | Cviky | exercisedb.p.rapidapi.com |
| `PEXELS_API_KEY` | Fallback | Ilustrační obrázky když Spoonacular/ExerciseDB nic nenajde |

**Minimální konfigurace pro obrázky:**
- Jídla: `SPOONACULAR_API_KEY` NEBO `RAPIDAPI_KEY`
- Cviky: `RAPIDAPI_KEY` + `EXERCISEDB_API_HOST`
- Fallback: `PEXELS_API_KEY`

---

## Ověření

Po nasazení zkontroluj v Vercel Logs:
- `[plan-enrichment] ENV summary: { hasSpoonacular: true, hasPexels: true, hasExerciseDb: true }`

Pokud vidíš `hasSpoonacular: false` – obrázky jídel se nebudou načítat.

---

## NEXT_PUBLIC_API_ONLY_MEDIA

Když je `true`, zobrazují se jen obrázky s `trust=exact` (Spoonacular, ExerciseDB). Ilustrační obrázky z Pexels se skrývají. Pro maximální pokrytí obrázků nastav na `false` nebo nevyplňuj.
