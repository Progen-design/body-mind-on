# Denní návyky – vybrané návrhy (B, C, D)

Z analýzy návyků – pouze body B), C), D).

---

## B) Denní pohyb – upřesnit popis

Změnit description z „aspoň 8000 kroků“ na např. **„pohyb navíc (procházka, kroky)“** nebo „min. 30 min chůze / 8000 kroků“, aby to bylo splnitelné i bez krokoměru.

*V kódu: `lib/habits.js` – položka `daily_movement`.*

---

## C) Zdravá strava – upřesnit vztah k plánu

Upravit description na např. **„kvalitní jídlo, dodržení jídelníčku nebo vyvážené porce“**, aby bylo jasné, že může jít i o dodržení AI plánu.

*V kódu: `lib/habits.js` – položka `healthy_diet`.*

---

## D) Wizard – doporučení počtu návyků

V kroku „Vyber si návyky“ v [components/HabitEntryWizard.js](components/HabitEntryWizard.js) přidat krátkou větu typu:

**„Doporučujeme vybrat 3–7 návyků – méně je často lépe udržitelné.“**

(Bez blokování vyššího počtu – jen doporučení.)
