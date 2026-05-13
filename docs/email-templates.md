# Email Templates – Weekly Plan (v2 / v4 / v5 / v6 / v7)

Provozní dokument pro emailové šablony týdenního plánu Body & Mind ON.

## Aktuální stav

| Component | Status |
|---|---|
| **Default šablona** | `v7` (Dark Rounded Modern · pure HTML, no PNG) |
| **Env var** | `EMAIL_TEMPLATE_VERSION=v7` v production / development |
| **Fallback chain** | v7 → v6 → v5 → v4 → v2 → legacy (HTML doc) |
| **Code path** | `lib/mail.js → sendPlanEmail()` |
| **Asset host** | žádný (pure HTML, container 540 px) |

## Soubory podle verze

| Verze | Template HTML | Renderer | Content (CS) | Assety |
|---|---|---|---|---|
| **v7** | `lib/templates/bmon_weekly_plan_email_v7.html` | `lib/weeklyPlanEmailV7.js` | `lib/templates/v5_content/coach_voice_v5_cs.json` (sdílí s v5/v6) | – (pure HTML) |
| **v6** | `lib/templates/bmon_weekly_plan_email_v6.html` | `lib/weeklyPlanEmailV6.js` | `lib/templates/v5_content/coach_voice_v5_cs.json` (sdílí s v5) | `public/email-assets/v6/{hero,motto,day-header,cta}.jpg` |
| **v5** | `lib/templates/bmon_weekly_plan_email_v5.html` | `lib/weeklyPlanEmailV5.js` | `lib/templates/v5_content/coach_voice_v5_cs.json` | – |
| **v4** | `lib/templates/bmon_weekly_plan_email_v4.html` | `lib/weeklyPlanEmailV4.js` | `lib/templates/v4_content/coach_voice_cs.json` | – |
| **v2** | `lib/templates/bmon_weekly_plan_email_v2.html` | `lib/weeklyPlanEmailV2.js` | – | – |
| **archív v6** | `lib/templates/_archive/bmon_weekly_plan_email_v6_pre_v7.html` | `lib/_archive/weeklyPlanEmailV6_pre_v7.js` | – | – |
| **archív v5** | `lib/templates/_archive/bmon_weekly_plan_email_v5_pre_fixes.html` | `lib/_archive/weeklyPlanEmailV5_pre_fixes.js` | – | – |
| **archív v4** | `lib/templates/_archive/bmon_weekly_plan_email_v4_pre_v5.html` | `lib/_archive/weeklyPlanEmailV4_pre_v5.js` | – | – |
| **archív v2** | `lib/templates/_archive/bmon_weekly_plan_email_v2_backup.html` | – | – | – |

## Co dělá v7 jinak (Dark Rounded Modern · pure HTML)

v7 řeší 4 kritické problémy v6 hybridní šablony pure-HTML přístupem:

| Problém ve v6 | Řešení ve v7 |
|---|---|
| Česká diakritika rozbitá v PNG (Outlook: "TVŮJ TÝDEN" → "TVL®J TÄťDEN") | PURE HTML, žádné PNG → UTF-8 vždy stabilní |
| Ostré hrany (border-radius 0 v PNG) | border-radius 16/12/10/8/999 px po celé šabloně |
| Vidět jen Den 1 (Days 2-7 placeholder) | Den 1 FULL + Dny 2-7 COMPACT cards (jednorázový kompaktní formát) |
| Container 600 px působí ztracený | Max-width **540 px** (tighter, focused) |

### Strukturální fakta v7

- Single-column **540 px** container (responzivní na <600 px breakpointu).
- **Inter font** s plnou českou diakritikou:
  `'Inter','-apple-system','BlinkMacSystemFont','Segoe UI','Roboto','Arial',sans-serif`.
  Geist se z v6 odstranil úplně.
- **Border-radius systém**: 16 px (hero / section / day full / motto / CTA),
  12 px (meal cards / day compact / kalorie box), 10 px (macros / profile tiles),
  8 px (CTA tlačítka), 999 px (pills / badges / daily summary / "Otevřít" link).
- **Žádné PNG bannery**. Žádné `<img>` tagy v HTML. Gmail proxy nemá co stáhnout
  → email proxy logs neukazují `/email-assets/*` GETy po odeslání v7.
- **Žádné CSS gradienty na text**, žádné `background-clip:text`, žádné
  `text-shadow`, žádné `transform/flex/grid`. Container-level linear-gradient
  zůstává jen jako `background-image` na background `<td>` motta a finálního CTA
  (Outlook desktop ho ignoruje a vidí flat fallback `bgcolor`).
- **Den 1 FULL karta**: gradient header (purple → pink) s ordinalem ("Den 01 ·
  První den"), datum slovy, 3 meal cards s recept tlačítky, daily summary pill
  s celkovými kalorii, workout card s intro + popisem + inline cviky.
- **Dny 2-7 COMPACT karty**: jedna karta na den, kompaktní header s názvem dne +
  číselné datum, 3 meal one-linery (☀ Snídaně, ◐ Oběd, ☾ Večeře), workout
  one-liner s prvními 3 cviky a "+ N dalších" tail, "Otevřít →" pill link.
- **HTML size ~55 KB** pro plný 7-denní plán (po minifikaci). Hluboko pod
  Gmail 102 KB clip threshold; email se nikdy nezkracuje, žádné "Show full message".
- Coach voice JSON sdílí s v5/v6 (`coach_voice_v5_cs.json`) – stejná mottos,
  intros, signatures, workout copy.

### Známé kompromisy v7

- **Outlook desktop má ostré rohy**. Word renderer ignoruje `border-radius`.
  Akceptovaný kompromis: prioritou jsou Gmail web / Apple Mail / iOS / Android
  (~90 %+ uživatelů). Outlook desktop dostane funkčně identický email,
  jen square corners.
- **Outlook desktop nemá gradient na motto / final CTA**. `background-image:linear-gradient`
  fallbackuje na flat `bgcolor` (purple resp. dark purple). Estetika OK, jen
  méně dramatická.
- **Coach voice intros** jsou zatím sdílené s v5/v6. Pokud chceme jiný "vibe"
  textů, bude potřeba nový `coach_voice_v7_cs.json`.

## Co dělá v6 jinak (zachováno pro fallback / historický kontext)

v6 hybridní architektura – pre-rendered JPG bannery (hero / motto / day-header /
cta) v `public/email-assets/v6/` + bulletproof HTML pro personalizovaný obsah.
Funkční, ale rozbila česká diakritika v PNG bannerech v Outlook + měla square
corners. Detaily viz git log commit `c68472f` (feat: v6 hybrid template).

## Co dělá v5 jinak

- Geist + Geist Mono font, mesh gradient pozadí (3 vrstvy radial gradients)
- Mega hero stats (7 dní / 21 jídel / X tréninků) v gradient typu
- Goal-specific barevná paleta v `getGoalPalette(goal)`
- Meal icons podle slotu: `☼ snídaně`, `◐ oběd`, `☾ večeře`, `◇ snack`
- Workout intensity coloring (easy/medium/hard/rest)
- Mid-motto plnošířková sekce s rotačním pravidlem týdne (10 mott)
- Final CTA s 5-stop gradient explosion
- Day header dramatic gradient (per-goal palette)

## Strukturované logování (lib/mail.js)

Každé volání `sendPlanEmail` emituje JSON log:

```json
{
  "event": "plan_email",
  "timestamp": "2026-05-13T00:03:23Z",
  "status": "sent",
  "provider": "gmail",
  "recipient": "ja***@gmail.com",
  "template": "v7",
  "template_version_requested": "v7",
  "fallback_triggered": false,
  "fallback_reason": null,
  "html_bytes": 55520,
  "duration_ms": 1234,
  "message_id": "<...>"
}
```

Při fallbacku:

| `templateUsed` | Význam |
|---|---|
| `v7` | Vše OK (default od commit d50ee50) |
| `v6_fallback_from_v7` | v7 renderer hodil chybu, použila se v6 |
| `v5_fallback_from_v7` | v7 i v6 padly, použila se v5 |
| `v4_fallback_from_v7` | v7/v6/v5 padly, použila se v4 |
| `v2_fallback_from_v7` | v7/v6/v5/v4 padly, použila se v2 |
| `legacy_fallback_from_v7` | Všechny strukturované renderery padly, použil se HTML legacy |
| `v6` / `v5` / … | Použito když env var `EMAIL_TEMPLATE_VERSION` nastavený na konkrétní starší verzi |

## Rollback playbook

### A) Rychlý 1-click rollback (~3 s)

1. Vercel dashboard → **Deployments** → najdi předchozí READY produkční deploy
   (typicky `dpl_DsnewtH3hmkUGHRkLf3XrSC9PLj4` = poslední v6 deploy)
2. Klikni **Promote to Production**

Tohle aktivuje předchozí build a všechny env vars z tehdejšího snapshotu.
Vhodné když je problém v kódu, ne v env var.

### B) Konfigurovatelný rollback přes env var (~60-90 s)

Vrátí jen šablonu na předchozí verzi (`v6`, `v5`, `v4`, `v2`, nebo `legacy`),
aplikační kód zůstane stejný. Vhodné když je problém v `v7` rendereru —
uživatel pak vidí v6 hybrid / v5 mesh gradient styl.

```powershell
# 1) Najdi env var ID:
$authPath = "$env:APPDATA\com.vercel.cli\Data\auth.json"
$token = (Get-Content $authPath -Raw | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }
$resp = Invoke-RestMethod -Uri "https://api.vercel.com/v10/projects/prj_nJrfInX8vnxrXwlCYbBy9E6AXGh7/env?teamId=team_yRlKHQ79h6WIN2BOT4P5tliS&decrypt=false" -Headers $headers
$resp.envs | Where-Object { $_.key -eq "EMAIL_TEMPLATE_VERSION" } | Select-Object key, value, id

# 2) PATCH na v6 (resp. v5 / v4 / legacy):
$headers["Content-Type"] = "application/json"
Invoke-RestMethod -Method PATCH -Uri "https://api.vercel.com/v10/projects/prj_nJrfInX8vnxrXwlCYbBy9E6AXGh7/env/<ENV_ID>?teamId=team_yRlKHQ79h6WIN2BOT4P5tliS" -Headers $headers -Body '{"value":"v6"}'

# 3) Force redeploy (warm Lambdas potřebují nový build aby zachytily novou env var):
git commit --allow-empty -m "chore(email): force redeploy to apply EMAIL_TEMPLATE_VERSION change"
git push origin main
```

> Alternativně přes Vercel CLI (`vercel env rm` + `vercel env add` se stdin
> soubor bez CRLF – PowerShell přidá CRLF na konec hodnoty pokud použiješ
> `echo "v6" | vercel env add`, což rozbije parsing).

### C) Automatický fallback (runtime)

Pokud renderer pro `v7` při běhu hodí výjimku, `lib/mail.js` automaticky zkusí
v6, pak v5, pak v4, pak v2, pak legacy. Event log obsahuje
`"fallback_triggered": true` a `"fallback_reason": "v7_failed:<message>"`.
Žádná akce v Cloudu není potřeba – ale je třeba prozkoumat chybu a opravit
v dalším deploy.

Monitoring filter:

```
event:plan_email AND fallback_triggered:true
```

### D) Negativní důkaz v7 v runtime logu

Klíčový rozdíl mezi v6 a v7:

- **v6 → po POST `/api/admin/send-test-plan-email`** Gmail proxy stáhne JPG
  assety: ~15 s po sendu jsou vidět GET requesty na
  `/email-assets/v6/{hero,motto,day-header,cta}.jpg` (status 200, později 304).
- **v7 → po POST sendu** žádné takové GETy nejsou – pure HTML, žádné `<img>`
  tagy, Gmail proxy nemá co fetchnout.

Tedy nepřítomnost `/email-assets/v6/*` fetchů v Vercel runtime logu po sendu
je nezvratný runtime důkaz, že v7 byla skutečně použita (a žádný runtime
fallback na v6 se nespustil).

## Lokální preview

```powershell
# 7 testovacích variant + 10-point audit (no PNG, Inter, diakritika, 7 dnů,
# border-radius 16/12/10/8/999, max-width 540, no background-clip/text-shadow,
# bgcolor coverage, HTML <150 KB, day ordinals):
node scripts/render-weekly-email-v7-preview.mjs

# Stejné pro starší verze:
node scripts/render-weekly-email-v6-preview.mjs
node scripts/render-weekly-email-v5-preview.mjs

# Render reálného plánu z DB:
node scripts/render-real-plan-preview.mjs <plan_id> v7
```

## Pravidla v7 (přísný design system)

- **Žádné `<img>` tagy** v šabloně ani v rendereru. PNG ekonomika ven.
- **Žádné `background-clip:text` / `text-shadow` / `transform` / `flex` / `grid`**.
- **`<meta name="color-scheme" content="dark only">`** plus
  `<meta name="supported-color-schemes" content="dark only">`. Spolu s
  `:root{color-scheme:dark only}` a `[data-ogsc] body,[data-ogsc] td{background-color:#0A0815 !important}`
  to vypne Gmail iOS dark-mode auto-invert.
- **Každý `<td>` s background-color má i atribut `bgcolor`**. Outlook desktop
  bere `bgcolor`, Gmail iOS bere inline `background-color`.
- **Žádné `#FFFFFF` / `#000000` na background**. Místo nich `#0A0815` / `#15101F`
  / `#1A1428` / `#F0EBFF` (palette). `#FFFFFF` se používá pouze na text v gradient
  panelech (motto, day header) kde je za ním `bgcolor="#A855F7"` fallback.
- **Border-radius systém** (přísný, žádné jiné hodnoty):
  - 16 px – hero card, section cards, day full card, motto, final CTA
  - 12 px – meal cards, day compact, kalorie box
  - 10 px – macro cards, profile tiles
  - 8 px – CTA tlačítka (oba: "Otevřít aplikaci →" v hero, "Otevřít v aplikaci →" v CTA)
  - 999 px – pills (section badges, "Recept →", "Otevřít →", daily summary)
- **8 px grid spacing**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64 (žádné 28/36/44).
- **Font sizes** (přísné, žádné jiné):
  - Hero name: 32 px desktop / 26 px mobile
  - Section title: 22 px desktop / 20 px mobile
  - Day name (full): 24 px desktop / 22 px mobile
  - Day name (compact): 18 px desktop / 16 px mobile
  - Meal name: 18 px desktop / 16 px mobile
  - Big number: 36 px (kcal) / 28 px (stat tiles), 28 px mobile
  - Body: 14 px desktop / 13 px mobile
  - Small: 12 px
  - Label/overline: 11 px UPPERCASE, letter-spacing 1 px
- **`cellpadding="0" cellspacing="0" border="0"`** atributy na všech tabulkách
  (i když mají inline style) – povinné pro Outlook desktop.
- **`border-collapse:separate !important`** na všech tabulkách s border-radius,
  protože `border-collapse:collapse` ruší rounded corners ve většině klientů.

## Známá omezení v7

- **HTML size ~55 KB** pro plný 7-denní plán s 3 jídly (po minifikaci).
  Hluboko pod Gmail clip threshold (102 KB) → email se nikdy nezkracuje,
  žádné "Zobrazit celou zprávu".
- **Inter font** – stejně jako Geist se Inter nahraje pouze v klientech, které
  respektují `@font-face`. Šablona spoléhá na fallback `-apple-system` /
  `Segoe UI` / Arial, které všechny mají plnou českou diakritiku, takže
  výsledek je vždy čitelný a konzistentní.
- **Outlook desktop má square corners**. Word renderer ignoruje
  `border-radius`. Akceptovaný kompromis.
- **Outlook desktop nemá gradient na motto / final CTA**. `background-image:linear-gradient`
  fallbackuje na flat `bgcolor`. Estetika OK, jen méně dramatická.
- **Coach voice intros** sdílené s v5/v6. Pokud chceš jiný tón textů
  ve v7, je potřeba nový `coach_voice_v7_cs.json`.

## Známá omezení v6 (kept for reference / fallback)

- **HTML size ~75–80 KB** pro plný 7-denní plán. Pod Gmail clip threshold.
- **Geist font** – stejné limity jako u v5.
- **Česká diakritika v PNG bannerech rozbitá v Outlook**. Toto byla finální
  motivace přejít na v7 pure HTML.
- **Asset host** – v6 PNG musí být dostupné z
  `https://app.bodyandmindon.cz/email-assets/v6/*.jpg`. v7 je pure HTML,
  takže žádnou závislost na asset hostu nemá.

## Známá omezení v5 (kept for reference)

- **HTML size ~125–130 KB** pro plný 7-denní plán s 3 jídly. Nad Gmail clip
  threshold; uživatel musí kliknout "Zobrazit celou zprávu" v Gmail web.
  v6 a v7 tento problém řeší.
- **VML gradient v Outlook desktop** je jen na hero sekci. Zbytek šablony
  v Outlook desktopu vidí flat-color sekce (žádné radial gradients).
