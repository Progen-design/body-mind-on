# Zdroje dat pro generování plánů

Generování jídelníčku i tréninku staví **výhradně** na těchto dvou platformách:

---

## 1. Jídelníček – Spoonacular

**URL:** https://spoonacular.com/food-api/console#Dashboard

- Recepty, obrázky jídel, nutriční hodnoty
- API klíč: `SPOONACULAR_API_KEY`
- Použití: `lib/services/spoonacularService.js`, `lib/mealEnrichment.js`

---

## 2. Trénink – wger.de

**URL:** https://wger.de/api/v2/

- Cviky, obrázky, videa
- Veřejné API, bez klíče
- Použití: `lib/services/wgerService.js`, `lib/exerciseEnrichment.js`

---

## Proč právě tyto platformy

- Mají vše potřebné pro plány (recepty, cviky, obrázky, metadata)
- Žádná závislost na RapidAPI ani dalších agregátorech
- Stabilní, dobře zdokumentované API
