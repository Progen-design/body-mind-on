# Manual test checklist – registrace + konzistence plánu

1. Nový uživatel v registraci zadá `Datum narození` (ne věk) a formulář jde odeslat.
2. V `body_metrics` se po registraci uloží `birth_date` a zároveň dopočtený `age`.
3. Na profilu (`/profil`) sekce `Tělesný vývoj` zobrazuje stejnou aktuální váhu jako data z Withings.
4. V `Dnešní plán` a `Týdenní plán` je pro stejný plán stejný kalorický target.
5. Po nové Withings váze se automaticky nepřepíše již publikovaný dnešní plán.
6. Při generování dalšího týdne je ve vstupu `withings_summary` a `plan_adjustment_signal`.
