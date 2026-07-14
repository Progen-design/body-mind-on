# Pravidla copy — Body & Mind ON

Tato pravidla platí pro landing page, aplikaci, onboarding, e-maily, notifikace, metadata a veškeré budoucí uživatelské texty.

## Chytrá zařízení

Chytré zařízení (váha, hodinky, pásek) **NENÍ** podmínka fungování systému.
Je to volitelná nadstavba, která zautomatizuje sběr dat.
Systém plně funguje s ručním zadáním jednoho čísla týdně.

Pořadí sdělení je závazné a nemění se:

1. co systém dělá za tebe
2. teprve pak zařízení jako navýšení pohodlí

Zařízení nesmí být první polovina věty ani podmínka výsledku.

### ŠPATNĚ

- „Napojíš chytrou váhu — o zbytek se nestaráš.“
- „Postavíš se na váhu, nebo zadáš číslo.“
- „Systém si data bere z chytré váhy.“
- „Váha pošle data sama.“
- „Bez chytré váhy stačí…“ (zařízení na začátku věty)

### SPRÁVNĚ

- „Stačí jedno číslo týdně — a s chytrým zařízením ani to ne.“
- „Plán se upravuje podle tvého vývoje. Zapisování neřešíš.“
- „Data se propisují sama. Chytré zařízení to jen zautomatizuje.“

### Výjimky (zařízení smí být v popředí)

- sekce `#autopilot` na LP (ukázka schopnosti systému)
- ceník ON CLUB („Napojení chytré váhy“) a srovnávací tabulka
- `/faq`, otázky o zařízeních
- nabídka prodeje zařízení (`device_interest`)
- integrační UI Withings v aplikaci (`/withings-connect`, sekce Tělesný vývoj po připojení)

## Automatická kontrola

Spusť `npm run lint:copy` v kořeni repozitáře (`body-mind-on` nebo `bodyandmindon-web`).
Skript `scripts/check-copy.mjs` selže při zakázaných vzorech mimo whitelist.

V kódu označ výjimky:

- `/* copy-check:whitelist:start */` … `/* copy-check:whitelist:end */` — celý blok
- `// copy-check:ignore` — jedna řádka
