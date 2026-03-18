# wger.de API – přehled a integrace

**Zdroj:** [wger.de/api/v2](https://wger.de/api/v2/)  
**Dokumentace:** [wger.readthedocs.io](https://wger.readthedocs.io/en/latest/api/api.html)

API je **veřejné**, bez autentizace pro čtení. Bez rate limitů pro běžné použití.

---

## Co wger umí (relevantní pro body-mind-on)

### 1. Cviky a obrázky cviků

| Endpoint | Popis | Použití |
|----------|-------|---------|
| `/exercise-translation/` | Názvy cviků v různých jazycích | Vyhledávání podle názvu (EN/CS) |
| `/exerciseimage/` | Obrázky cviků (PNG) | Obrázek k cviku |
| `/exercise/` | Základní data cviku (kategorie, svaly, vybavení) | Metadata |
| `/exercisecategory/` | Kategorie cviků | Klasifikace |
| `/equipment/` | Vybavení | Filtrování |
| `/muscle/` | Svalové skupiny | Filtrování |

**Jazyky:** Čeština = `language=9` (short_name: cs)

**Příklad vyhledávání cviku:**
```
GET /api/v2/exercise-translation/?search=squat&language=2
→ results[].exercise = ID cviku
GET /api/v2/exerciseimage/?exercise=167&is_main=true
→ results[0].image = URL obrázku (https://wger.de/media/...)
```

**Použití v body-mind-on:**
- wger je jediný zdroj pro obrázky a videa cviků (žádný RapidAPI, ExerciseDB)

---

### 2. Jídla a ingredience

| Endpoint | Popis | Použití |
|----------|-------|---------|
| `/ingredient/` | Ingredience (Open Food Facts) | Vyhledávání jídel |
| `/ingredient-image/` | Obrázky ingrediencí | Obrázek k jídlu |
| `/meal/` | Jídla v plánu | Nutriční plán |
| `/mealitem/` | Položky v jídle | Složení jídla |
| `/nutritionplan/` | Nutriční plán | Plánování stravy |

**Ingredience:** ~3M záznamů z Open Food Facts, fulltextové vyhledávání `?search=chicken`

**Příklad:**
```
GET /api/v2/ingredient/?search=kuře&limit=5
→ name, energy, protein, carbohydrates, fat, ...
```

**Rozdíl oproti Spoonacular:**
- wger: ingredience + nutriční hodnoty, méně receptů
- Spoonacular: recepty, obrázky jídel, komplexní vyhledávání
- wger může doplnit Spoonacular pro nutriční data

---

### 3. Tréninkové plány (workouts)

| Endpoint | Popis | Použití |
|----------|-------|---------|
| `/routine/` | Rutiny | Uložené tréninky |
| `/day/` | Dny v rutině | Struktura týdne |
| `/slot/` | Sloty v dni | Bloky cviků |
| `/workoutsession/` | Provedené tréninky | Logování |
| `/workoutlog/` | Záznamy o cvičení | Historie |

**Poznámka:** Tyto endpointy vyžadují **autentizaci** (JWT nebo token) – pro vytváření/úpravu plánů uživatele.

---

### 4. Další

| Endpoint | Popis |
|----------|-------|
| `/language/` | Seznam jazyků (cs=9) |
| `/weightentry/` | Záznamy váhy |
| `/measurement/` | Měření (obvod pasu, atd.) |
| `/gallery/` | Uživatelské fotky |

---

## Návrh integrace do body-mind-on

### Fáze 1: Cviky (obrázky) – implementováno

1. `lib/exerciseEnrichment.js` používá `wgerService.resolveExercise(searchName)`
2. Pořadí: exercise_asset_registry (DB) → **wger.de** → none
3. wger: `exercise-translation?search=X&language=2` → `exerciseimage?exercise=ID`
4. Vrací `image_url` (PNG), `gif_url` (video_url pokud existuje), `source: 'wger'`

**Výhody:** Zdarma, bez API klíče, čeština (language=9), 885+ cviků s obrázky

### Fáze 2: Jídla (nutriční data) – volitelné

1. Pro jídla z plánu: vyhledat v `/ingredient/?search=X`
2. Doplnit nutriční hodnoty (kalorie, bílkoviny, sacharidy, tuky)
3. Obrázky: `ingredient-image` nebo ponechat Spoonacular

### Fáze 3: Tréninkové šablony – budoucí

1. Veřejné šablony: `/public-templates/`
2. Pro přihlášené: vlastní rutiny přes autentizované API

---

## API struktura (klíčové odpovědi)

**exercise-translation:**
```json
{
  "results": [{
    "id": 2433,
    "name": "Crunches",
    "exercise": 167,
    "language": 2
  }]
}
```

**exerciseimage:**
```json
{
  "results": [{
    "exercise": 167,
    "image": "https://wger.de/media/exercise-images/91/Crunches-1.png",
    "is_main": true
  }]
}
```

**ingredient:**
```json
{
  "results": [{
    "name": "Chicken breast",
    "energy": 165,
    "protein": "31.0",
    "carbohydrates": "0.0",
    "fat": "3.6"
  }]
}
```

---

## Shrnutí

| Funkce | wger | Současný stav v projektu |
|--------|------|---------------------------|
| Obrázky cviků | ✅ PNG, videa, zdarma | wger.de (jediný zdroj) |
| Obrázky jídel | ❌ jen ingredience | Spoonacular |
| Nutriční data | ✅ ingredience | – |
| Recepty | ❌ | Spoonacular |
| Tréninkové plány | ✅ (s auth) | AI generované plány |

**Stav:** wger je jediný provider pro cviky. Žádný RapidAPI ani ExerciseDB.
