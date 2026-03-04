# Návrhy vylepšení a automatizace (na základě toho, co už existuje)

Prošel jsem koncept aplikace: **Google Kalendář** (propojení, čtení, zápis z Adminu, mřížka na profilu) a **denní e-mail** (cron `daily-digest`, jídelníček z plánu, trénink dnes, doporučení). Níže jsou **konkrétní** vylepšení, která staví na tom, co už máte, a nic neduplikují.

---

## 1. Denní digest + kalendář trenéra (doplnit zdroj „Trénink dnes“)

**Stav:** V denním e-mailu sekce „Trénink dnes“ bere data **jen z tabulky `workouts`** (co uživatel už zapsal na dnešek). Kalendář trenéra se v digestu nepoužívá.

**Návrh:** V `buildDigestPayload` (lib/dailyDigest.js) navíc načíst **události z kalendáře trenéra na dnešek** (stejná logika jako trainer-schedule: token z `trainer_calendar_tokens`, `listEvents` na dnešek, filtrovat `eventIsForUser(ev, email)`). Do payloadu přidat např. `plannedToday: [{ summary, start }]`. V šabloně e-mailu:
- Pokud má uživatel **plánovaný trénink dnes** (z kalendáře): zobrazit „Dnes máš v plánu: [název] v [čas]. Po tréninku ho zapiš v profilu.“
- Pokud už má **zapsaný** trénink v DB: ponechat stávající řádek (název · min).
- Pokud nemá ani plán, ani zapsaný: ponechat „Dnes nemáš zapsaný trénink…“

**Přínos:** Uživatel vidí v e-mailu přímo to, co má v kalendáři (trenér mu to tam dal), ne jen to, co si sám zapsal.

---

## 2. Opt-out denního e-mailu

**Stav:** Cron posílá digest **všem** uživatelům s e-mailem. Není možnost vypnout.

**Návrh:** Zavedení preference „neposílat denní digest“:
- **Varianta A:** Nová tabulka `user_preferences` (user_id, daily_email: boolean, …) nebo sloupec v existující tabulce (např. u profilu / body_metrics), pokud tam dává smysl.
- **Varianta B:** V Supabase Auth `user_metadata` (např. `daily_email: false`) – bez migrace, ale méně vhodné pro časté čtení v cronu.
- V cronu před odesláním: pro každého uživatele zkontrolovat preference; pokud `daily_email === false`, přeskočit.
- V aplikaci: v profilu / nastavení přepínač „Posílat denní přehled e-mailem“ (uložit do DB nebo metadata).

**Přínos:** Respekt k uživatelům, kteří denní e-mail nechtějí; méně odhlášení jako spam.

---

## 3. Připomínka před tréninkem (e-mail X hodin před začátkem)

**Stav:** Kalendář máte; denní digest jde ráno. Chybí **ad hoc připomínka** těsně před konkrétním termínem.

**Návrh:** Nový cron (např. každou hodinu, nebo každých 30 min), např. `/api/cron/remind-upcoming`:
- Načíst z `trainer_calendar_tokens` token, případně refresh.
- Načíst události z kalendáře na **dnes** (timeMin/timeMax = dnešek).
- Pro každou událost: pokud `start` je za 2–4 hodiny (konfigurovatelné), z události získat e-maily (Pro: / attendees), pro každý e-mail poslat jeden e-mail typu: „Připomínka: za cca 2 hodiny máš [název] v [čas].“
- Aby se neposílalo opakovaně: uložit si např. do tabulky `reminder_sent` (event_id + user_email + date) nebo do Redis; před odesláním zkontrolovat, že tento event už dnes pro tento e-mail připomínka nešla.

**Přínos:** Klienti dostanou včasnou připomínku před konkrétním tréninkem bez ruční práce trenéra.

---

## 4. Sekce „Doporučení“ v digestu – propojit s kalendářem

**Stav:** Text doporučení se skládá z obecných vět (drž se plánu, zapiš trénink, počet návyků, otevři profil). Sekce „Doporučení“ je někdy prázdná nebo málo konkrétní.

**Návrh:** Po doplnění bodu 1 (kalendář v digestu) do doporučení přidat větu podle stavu:
- Má dnes v kalendáři trénink a ještě ho nezapsal: „Dnes máš v plánu [název] v [čas] – po tréninku ho zapiš v profilu, ať máš odhad váhy přesný.“
- Už zapsal: „Máš dnes zapsaný trénink – dobrá práce.“
- Nemá nic naplánované ani zapsané: ponechat stávající „Pokud dnes cvičíš, zapiš si trénink…“

**Přínos:** Doporučení bude konkrétní a v souladu s tím, co uživatel vidí v „Trénink dnes“ a v kalendáři na profilu.

---

## 5. Upozornění trenéra: kalendář nepropojen / token vyprší

**Stav:** Když `trainer_calendar_tokens` je prázdné nebo token selže, uživatelé prostě nevidí rozvrh. Trenér o tom nemusí vědět.

**Návrh:** Při každém volání `trainer-schedule` (nebo v lehkém cronu 1× denně) zkontrolovat: jsou tokeny? platí ještě dost dlouho (např. refresh_token existuje a expires_at není za < 7 dní)? Pokud ne, poslat **jednu** e-mailovou notifikaci na pevnou adresu (info@ nebo env `TRAINER_ALERT_EMAIL`): „Kalendář trenéra není propojen nebo brzy vyprší. Propoj znovu přes Admin.“ Aby se neposílalo 100×: uložit do DB nebo cache, že alert už pro tento „stav“ byl odeslán; po opětovném propojení flag vynulovat.

**Přínos:** Trenér včas ví, že má znovu propojit kalendář; méně „proč nikdo nevidí rozvrh“.

---

## 6. Týdenní rozvrh e-mailem (volitelně)

**Stav:** Denní digest = jeden den. Kalendář na profilu = mřížka na 90 dní.

**Návrh:** Nový cron (např. neděle 20:00): pro každého uživatele načíst z kalendáře události na **následujících 7 dní** (filtrovat `eventIsForUser`), sestavit krátký text nebo HTML („Tento týden máš: Po 17:00 Silový, St 18:00 Kardio, …“) a poslat e-mail „Tvůj rozvrh na týden“. Lze dělat jako druhý e-mail v ten samý den, nebo jednu „týdenní“ zprávu místo pondělního digestu – dle preference.

**Přínos:** Uživatel má přehled na celý týden bez nutnosti otevírat aplikaci.

---

## Pořadí doporučené implementace

| Priorita | Bod | Důvod |
|----------|-----|--------|
| 1 | **Denní digest + kalendář** (bod 1 a 4) | Malá změna v existujícím digestu, velký smysl: „Trénink dnes“ a doporučení budou odpovídat kalendáři. |
| 2 | **Opt-out denního e-mailu** (bod 2) | GDPR / spokojenost; jednoduchá tabulka nebo sloupec + jeden filtr v cronu. |
| 3 | **Upozornění trenéra** (bod 5) | Jednoduchá kontrola + jeden e-mail; předejde „rozvrh nefunguje“. |
| 4 | **Připomínka před tréninkem** (bod 3) | Nový cron + logika „za 2–4 h“ + odeslání; střední náročnost. |
| 5 | **Týdenní rozvrh e-mailem** (bod 6) | Rozšíření o další cron a šablonu; až po ověření zájmu. |

Všechny body staví na **stávajícím** napojení na Google Kalendář a na **stávajícím** systému automatických e-mailů (denní digest); nic z toho neduplikují, jen je propojují a doplňují.
