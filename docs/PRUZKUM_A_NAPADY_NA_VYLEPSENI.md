# Průzkum podobných webů a nápady na vylepšení

*Průzkum proveden v souvislosti s nasazením úprav receptů (odkazy, cache).*

---

## Podobné weby / aplikace (téma: AI plán, jídelníček, trénink)

| Služba | Co dělá | Inspirace |
|--------|--------|-----------|
| **Meal Plan AI** (meal-plan.app) | AI jídelníček, diety (keto, vegan, diabetes), asistent hlasem/fotkou, nákupní seznamy | Hlasové/foto zadání; nákupní seznam z receptů |
| **iifym.fit** | Makra na míru, generování jídelníčku za sekundy, výměna jídel | Rychlá výměna jídla za jiné (swap) |
| **Kaizen Fit** (kaizenfit.app) | AI trénink + jídelníček, vlastní API klíč nebo premium | Volba „vlastní klíč“ vs. předplatné |
| **FitnessAlly** (fitnessally.io) | Workout + recepty z fotek vybavení/spíže, AI asistent Alfred | Personalizace podle „co mám doma“ |
| **BodyBy.AI** (bodyby.ai) | AI trenérka, jídelníček, skenování jídla, sledování pokroku | Srovnání ceny (např. vs. trenér); sken jídla |
| **BetterMe, Openfit** | Fitness/wellness onboarding | Krátké, motivující dotazy; vizuálně atraktivní registrace |

---

## Obecné principy (onboarding a UX)

- **Nepřetěžovat:** Nepředložit najednou 20+ polí; rozdělit do kroků a vysvětlit, proč údaj potřebujeme.
- **Progresivní odhalení:** Základní funkce hned, pokročilé (strava, omezení) po rozkliknutí nebo později.
- **Méně tření:** Rychlé přidání (quick-add), předvyplnění, u receptů cache a odkazy místo velkého HTML.
- **Personalizace:** Každý údaj má vliv na plán; uživatel to má vidět (např. „Díky tomu, že jsi vybral vegan, …“).
- **Motivace a důvěra:** Krátké motivační texty, jasná cena/hodnota („místo X Kč za trenéra“), sociální důkaz.

---

## Nápady na vylepšení pro Body & Mind ON

### Rychlé wins (bez velkého vývoje)

1. **Nákupní seznam z plánu**  
   Z receptů na týden vygenerovat jeden seznam surovin (např. „Přidat do nákupu“ nebo export do poznámek).

2. **Výměna jídla (swap)**  
   U jídla v jídelníčku tlačítko „Nahradit jiným“ → výběr z kategorie (snídaně/oběd/večeře) nebo rychlé vygenerování alternativy přes stávající API.

3. **Krátké „proč“ u dotazníku**  
   U složitějších polí (aktivita, stres, typ práce) jedna věta: „Pomůže nám to nastavit kalorie a intenzitu.“

4. **Odhad času u receptu**  
   V API receptu nebo v plánu přidat pole „Připravíš za cca X min“ (odhad nebo z promptu).

### Střední rozsah

5. **Kroků onboarding místo jedné dlouhé stránky**  
   Např. krok 1: jméno + e-mail + heslo; krok 2: tělesné údaje; krok 3: cíl + frekvence; krok 4: strava a omezení (volitelné). Každý krok jedna obrazovka, progress bar.

6. **Filtry v sekci Recepty**  
   Podle typu (snídaně/oběd/večeře), podle času přípravy, „bez lepku“ atd. – pokud už máme v plánu diet_type/preferences.

7. **Sdílení plánu / export**  
   „Poslat plán e-mailem znovu“, „Stáhnout týdenní jídelníček jako PDF“ – zvyšuje použitelnost a sdílení.

8. **Jednoduché milestone po registraci**  
   Např. „Tvůj plán je připraven“, „První trénink zapsán“, „Týden v aplikaci“ – s krátkým textem a případně odkazem na další krok.

### Delší horizont (body & mind téma)

9. **Krátké „mindset“ tipy u plánu**  
   Jedna věta u dne nebo u týdne (např. z AI nebo pevné sady), aby byl důraz na „mind“ vidět i v UI.

10. **Skenování jídla / fotka oběda**  
    Fotka → odhad maker nebo „přidat do deníku“ – podobně jako BodyBy.AI / FitnessAlly.

11. **Propojení s kalendářem**  
    „Přidat tréninky do Google Calendar“ nebo export .ics – téma „fitting your life“ (Kaizen Fit).

---

## Zdroje (výběr)

- Meal Plan AI, iifym.fit, Kaizen Fit, FitnessAlly, BodyBy.AI – konkurence a feature inspirace.
- Medium: „Designing an engaging onboarding flow“ (NutriFit), „Onboarding Experience for Health and Fitness App“ (FitHealth).
- UX Design: „Onboarding for mobile health apps“.
- Sigma Software: „A Complete Guide to Creating a Successful Wellness Mobile App in 2024“.
- Zigpoll: User-centered design pro wellness rozhraní.

---

*Dokument lze doplňovat po dalším průzkumu nebo po A/B testech.*
