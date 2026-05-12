# Email Templates – Weekly Plan (v2 / v4 / v5)

Provozní dokument pro emailové šablony týdenního plánu Body & Mind ON.

## Aktuální stav

| Component | Status |
|---|---|
| **Default šablona** | `v5` (Athletic Motion) |
| **Env var** | `EMAIL_TEMPLATE_VERSION=v5` v production / preview / development |
| **Fallback chain** | v5 → v4 → v2 → legacy (HTML doc) |
| **Code path** | `lib/mail.js → sendPlanEmail()` |

## Soubory podle verze

| Verze | Template HTML | Renderer | Content (CS) |
|---|---|---|---|
| **v5** | `lib/templates/bmon_weekly_plan_email_v5.html` | `lib/weeklyPlanEmailV5.js` | `lib/templates/v5_content/coach_voice_v5_cs.json` |
| **v4** | `lib/templates/bmon_weekly_plan_email_v4.html` | `lib/weeklyPlanEmailV4.js` | `lib/templates/v4_content/coach_voice_cs.json` |
| **v2** | `lib/templates/bmon_weekly_plan_email_v2.html` | `lib/weeklyPlanEmailV2.js` | – |
| **archív v4** | `lib/templates/_archive/bmon_weekly_plan_email_v4_pre_v5.html` | `lib/_archive/weeklyPlanEmailV4_pre_v5.js` | – |
| **archív v2** | `lib/templates/_archive/bmon_weekly_plan_email_v2_backup.html` | – | – |

## Co dělá v5 jinak

- Geist + Geist Mono font, mesh gradient pozadí (3 vrstvy radial gradients)
- Mega hero stats (7 dní / 21 jídel / X tréninků) v gradient typu
- **Goal-specific barevná paleta** (`getGoalPalette(goal)` v `lib/weeklyPlanEmailV5.js`):
  - `muscle_gain` – purple `#A855F7` → pink `#EC4899` → gold `#F59E0B`
  - `weight_loss` – blue `#3B82F6` → cyan `#06B6D4` → green `#10B981`
  - `maintenance` – grey `#94A3B8` → silver `#CBD5E1` → white `#E2E8F0`
  - `endurance` – green `#22C55E` → yellow `#EAB308` → orange `#F97316`
- **Meal icons** podle slotu: `☼ snídaně`, `◐ oběd`, `☾ večeře`, `◇ snack`
- **Workout intensity coloring**: `easy` zelený tint, `medium` purple (default), `hard` red, `rest` → block s motto "Pohyb. Dnes odpočinek. Tělo to potřebuje."
- Mid-motto plnošířková sekce s rotačním pravidlem týdne (10 mott v `coach_voice_v5_cs.json`)
- Final CTA s 5-stop gradient explosion
- Day header dramatic gradient (per-goal palette)

## Strukturované logování (lib/mail.js)

Každé volání `sendPlanEmail` emituje JSON log:

```json
{
  "event": "plan_email",
  "timestamp": "2026-05-12T21:42:04Z",
  "status": "sent",
  "provider": "gmail",
  "recipient": "ja***@gmail.com",
  "template": "v5",
  "template_version_requested": "v5",
  "fallback_triggered": false,
  "fallback_reason": null,
  "html_bytes": 163802,
  "duration_ms": 1234,
  "message_id": "<...>"
}
```

Při fallbacku:

| `templateUsed` | Význam |
|---|---|
| `v5` | Vše OK |
| `v4_fallback_from_v5` | v5 renderer hodil chybu, použila se v4 |
| `v2_fallback_from_v5` | v5 i v4 padly, použila se v2 |
| `legacy_fallback_from_v5` | Všechny tři padly, použil se HTML legacy |

## Rollback playbook

### A) Rychlý 1-click rollback (~3 s)

1. Vercel dashboard → **Deployments** → najdi předchozí READY produkční deploy
2. Klikni **Promote to Production**

Tohle aktivuje předchozí build a všechny env vars z tehdejšího snapshotu. Vhodné když je problém v kódu, ne v env var.

### B) Konfigurovatelný rollback přes env var (~60-90 s)

Vrátí jen šablonu na předchozí verzi (v4), aplikační kód zůstane stejný. Vhodné když je problém v `v5` rendereru.

```powershell
# 1) Zjisti env var ID:
$authPath = "$env:APPDATA\com.vercel.cli\Data\auth.json"
$token = (Get-Content $authPath -Raw | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }
$resp = Invoke-RestMethod -Uri "https://api.vercel.com/v10/projects/prj_nJrfInX8vnxrXwlCYbBy9E6AXGh7/env?teamId=team_yRlKHQ79h6WIN2BOT4P5tliS&decrypt=false" -Headers $headers
$resp.envs | Where-Object { $_.key -eq "EMAIL_TEMPLATE_VERSION" } | Select-Object key, value, id

# 2) PATCH na v4 (resp. v2 nebo legacy):
$headers["Content-Type"] = "application/json"
Invoke-RestMethod -Method PATCH -Uri "https://api.vercel.com/v10/projects/prj_nJrfInX8vnxrXwlCYbBy9E6AXGh7/env/dd2XPoHjn8ghPDpE?teamId=team_yRlKHQ79h6WIN2BOT4P5tliS" -Headers $headers -Body '{"value":"v4"}'

# 3) Force redeploy (warm Lambdas potřebují nový build aby zachytily novou env var):
git commit --allow-empty -m "chore(email): force redeploy to apply EMAIL_TEMPLATE_VERSION change"
git push origin main
```

> ⚠️ **Nepoužívej `vercel env add` přes stdin v PowerShellu** – přidá CRLF na konec hodnoty
> (např. `v4\r\n`), což rozbije parsing. Použij REST API nebo HEREDOC v bashi.

### C) Automatický fallback (runtime)

Pokud renderer pro `v5` při běhu hodí výjimku, `lib/mail.js` automaticky zkusí v4, pak v2, pak legacy. Event log obsahuje `"fallback_triggered": true` a `"fallback_reason": "v5_failed:<message>"`. Žádná akce v Cloudu není potřeba – ale je třeba prozkoumat chybu a opravit v dalším deploy.

Monitoring filter:

```
event:plan_email AND fallback_triggered:true
```

## Lokální preview

```powershell
# 7 testovacích variant + audit (clip size, em-dash, no placeholders, XSS escape):
node scripts/render-weekly-email-v5-preview.mjs

# Render reálného plánu z DB:
node scripts/render-real-plan-preview.mjs <plan_id> v5

# Audit script ověřuje:
# - žádné leftover {{...}} placeholdery
# - HTML escape funguje (XSS)
# - target="_blank" na všech odkazech
# - velikost ≤ 102 KB (Gmail clip; nad limitem se zobrazí varování)
```

## Známá omezení v5

- **HTML size ~150–165 KB** pro plný 7-denní plán s 3 jídly. Gmail web nad 102 KB email "clipne" a uživatel musí kliknout "Zobrazit celou zprávu". Nelze obejít bez velkého přepisu šablony (extrakce stylů do `<style>` tag, který Outlook ignoruje). v4 byl stejně velký, akceptováno.
- **Geist font** – Geist se v emailu načítá přes `@import url(...fonts.googleapis.com...)`. Některé klienty (Outlook) tento import ignorují a použijí `Arial`. Šablona má fallback chain `'Geist','Inter',Arial,sans-serif`.
- **Webkit gradient text** (`-webkit-background-clip:text`) funguje v Gmailu, Apple Mail a moderním Outlook web. V starší Outlooku se zobrazí prostý text barvy `color:` fallback (purple pro most prvky).
