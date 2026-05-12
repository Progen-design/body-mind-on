# Email Templates – Weekly Plan (v2 / v4 / v5 / v6)

Provozní dokument pro emailové šablony týdenního plánu Body & Mind ON.

## Aktuální stav

| Component | Status |
|---|---|
| **Default šablona** | `v6` (Hybrid PNG + bulletproof HTML) |
| **Env var** | `EMAIL_TEMPLATE_VERSION=v6` v production / preview / development |
| **Fallback chain** | v6 → v5 → v4 → v2 → legacy (HTML doc) |
| **Code path** | `lib/mail.js → sendPlanEmail()` |
| **PNG asset host** | `https://app.bodyandmindon.cz/email-assets/v6/` |

## Soubory podle verze

| Verze | Template HTML | Renderer | Content (CS) | PNG assets |
|---|---|---|---|---|
| **v6** | `lib/templates/bmon_weekly_plan_email_v6.html` | `lib/weeklyPlanEmailV6.js` | `lib/templates/v5_content/coach_voice_v5_cs.json` (sdílí s v5) | `public/email-assets/v6/{hero,motto,day-header,cta}.jpg` |
| **v5** | `lib/templates/bmon_weekly_plan_email_v5.html` | `lib/weeklyPlanEmailV5.js` | `lib/templates/v5_content/coach_voice_v5_cs.json` | – |
| **v4** | `lib/templates/bmon_weekly_plan_email_v4.html` | `lib/weeklyPlanEmailV4.js` | `lib/templates/v4_content/coach_voice_cs.json` | – |
| **v2** | `lib/templates/bmon_weekly_plan_email_v2.html` | `lib/weeklyPlanEmailV2.js` | – | – |
| **archív v4** | `lib/templates/_archive/bmon_weekly_plan_email_v4_pre_v5.html` | `lib/_archive/weeklyPlanEmailV4_pre_v5.js` | – | – |
| **archív v2** | `lib/templates/_archive/bmon_weekly_plan_email_v2_backup.html` | – | – | – |

## Co dělá v6 jinak (hybridní architektura)

v6 řeší kořenový problém v5: ne všichni klienti renderují CSS gradienty / text-shadow stejně.
Místo toho posouvá vizuální identitu do **pre-renderovaných JPG bannerů**, zatímco osobní data
zůstávají v bulletproof tabulkovém HTML.

- 4 statické JPG bannery v `public/email-assets/v6/` (regeneruje se přes
  `powershell -ExecutionPolicy Bypass -File scripts/generate-v6-png-assets.ps1`):
  - **hero.jpg** 1200×500 · 33 KB · dark mesh gradient + "TVŮJ TÝDEN"
  - **motto.jpg** 1200×400 · 21 KB · centered "▲ PRAVIDLO TÝDNE ▲" label
  - **day-header.jpg** 1200×250 · 14 KB · dramatic 5-stop purple→pink→gold band
  - **cta.jpg** 1200×500 · 30 KB · explosive CTA panel s "Pojďme do toho."
- **Pouze brand-level statický text v PNG** (BMON, NEW WEEK, READY TO GO, TVŮJ DEN, motto label).
  Vše personalizované (jméno v 5. pádě, motto, jídla, makra, datum, …) je v HTML.
- Single-column **600px container**, žádné CSS gradienty, žádné text-shadow, žádné
  background-clip, žádné transform/flex/grid. Jen tabulky + bgcolor.
- Compact **inline macro line per meal** (`P 35g · S 60g · T 8g · V 4g`) drží každou
  meal card pod ~1.4 KB a celý HTML pod 80 KB.
- Absolutní PNG URL přes `NEXT_PUBLIC_BASE_URL` (fallback `https://app.bodyandmindon.cz`)
  – email klienti musí dosáhnout na veřejný origin.
- Coach voice JSON sdílí s v5 (`coach_voice_v5_cs.json`) – stejná mottos, intros, signatures.

## Fallback pro vypnuté obrázky

Všechny **kritické informace jsou v HTML, ne v PNG**, takže email funguje i bez obrázků:
- Jméno, intro, stats (DNÍ/JÍDEL/TRÉNINKY) → HTML text ✓
- Profil + makra + KCAL → HTML tabulka ✓
- Motto text → HTML pod motto.jpg ✓
- 21 jídel + makra + RECEPT linky → HTML tabulka ✓
- Den jména + datumy + tréninky → HTML pod day-header.jpg ✓
- CTA tlačítka → HTML `<a>` (Otevřít aplikaci / Otevřít v aplikaci) ✓

Každý `<img>` má `alt` text pro fallback ("Tvůj týden je tady. Sedm dní. Začínáme.",
"Pravidlo týdne", "Den X", "Pojďme do toho.").

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
  "timestamp": "2026-05-12T22:56:36Z",
  "status": "sent",
  "provider": "gmail",
  "recipient": "ja***@gmail.com",
  "template": "v6",
  "template_version_requested": "v6",
  "fallback_triggered": false,
  "fallback_reason": null,
  "html_bytes": 81753,
  "duration_ms": 1234,
  "message_id": "<...>"
}
```

Při fallbacku:

| `templateUsed` | Význam |
|---|---|
| `v6` | Vše OK (default od commit 3684e80) |
| `v5_fallback_from_v6` | v6 renderer hodil chybu, použila se v5 |
| `v4_fallback_from_v6` | v6 i v5 padly, použila se v4 |
| `v2_fallback_from_v6` | v6/v5/v4 padly, použila se v2 |
| `legacy_fallback_from_v6` | Všechny strukturované renderery padly, použil se HTML legacy |
| `v5` / `v4_fallback_from_v5` / … | Použito když env var `EMAIL_TEMPLATE_VERSION=v5` (kompatibilní s pre-v6 chováním) |

## Rollback playbook

### A) Rychlý 1-click rollback (~3 s)

1. Vercel dashboard → **Deployments** → najdi předchozí READY produkční deploy
2. Klikni **Promote to Production**

Tohle aktivuje předchozí build a všechny env vars z tehdejšího snapshotu. Vhodné když je problém v kódu, ne v env var.

### B) Konfigurovatelný rollback přes env var (~60-90 s)

Vrátí jen šablonu na předchozí verzi (`v5`, `v4`, `v2`, nebo `legacy`), aplikační kód zůstane stejný. Vhodné když je problém v `v6` rendereru (např. PNG asset broken, font missing, atd.) — uživatel pak vidí pixel-perfect v5 stylem.

```powershell
# 1) Zjisti env var ID:
$authPath = "$env:APPDATA\com.vercel.cli\Data\auth.json"
$token = (Get-Content $authPath -Raw | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }
$resp = Invoke-RestMethod -Uri "https://api.vercel.com/v10/projects/prj_nJrfInX8vnxrXwlCYbBy9E6AXGh7/env?teamId=team_yRlKHQ79h6WIN2BOT4P5tliS&decrypt=false" -Headers $headers
$resp.envs | Where-Object { $_.key -eq "EMAIL_TEMPLATE_VERSION" } | Select-Object key, value, id

# 2) PATCH na v5 (resp. v4 / v2 / legacy):
$headers["Content-Type"] = "application/json"
Invoke-RestMethod -Method PATCH -Uri "https://api.vercel.com/v10/projects/prj_nJrfInX8vnxrXwlCYbBy9E6AXGh7/env/dd2XPoHjn8ghPDpE?teamId=team_yRlKHQ79h6WIN2BOT4P5tliS" -Headers $headers -Body '{"value":"v5"}'

# 3) Force redeploy (warm Lambdas potřebují nový build aby zachytily novou env var):
git commit --allow-empty -m "chore(email): force redeploy to apply EMAIL_TEMPLATE_VERSION change"
git push origin main
```

> ⚠️ **Nepoužívej `vercel env add` přes stdin v PowerShellu** – přidá CRLF na konec hodnoty
> (např. `v4\r\n`), což rozbije parsing. Použij REST API nebo HEREDOC v bashi.

### C) Automatický fallback (runtime)

Pokud renderer pro `v6` při běhu hodí výjimku, `lib/mail.js` automaticky zkusí v5, pak v4, pak v2, pak legacy. Event log obsahuje `"fallback_triggered": true` a `"fallback_reason": "v6_failed:<message>"`. Žádná akce v Cloudu není potřeba – ale je třeba prozkoumat chybu a opravit v dalším deploy.

Monitoring filter:

```
event:plan_email AND fallback_triggered:true
```

Můžete také ověřit že produkce skutečně rozesílá v6 přímo z Vercel runtime logů — po
odeslání emailu se objevují **GET requesty na `/email-assets/v6/{hero,motto,day-header,cta}.jpg`**
od Gmail proxy (~15s po POST send-test-plan-email). To je nezvratný důkaz že
template obsahoval v6 PNG URLs; pokud by byl spadnutý fallback na v5, tyto requesty
by neexistovaly.

## Lokální preview

```powershell
# 7 testovacích variant + audit (HTML <80 KB, no placeholders, XSS escape,
# žádné gradient/text-shadow/transform v HTML, všechny <td> s bgcolor):
node scripts/render-weekly-email-v6-preview.mjs

# Stejné pro starší verze:
node scripts/render-weekly-email-v5-preview.mjs

# Render reálného plánu z DB:
node scripts/render-real-plan-preview.mjs <plan_id> v6

# Regenerace PNG assetů (po úpravě barev/textu/layoutu):
powershell -ExecutionPolicy Bypass -File scripts/generate-v6-png-assets.ps1
```

## Pravidla pro Gmail iOS / Outlook desktop (zděděno z v5 fix 031a672)

v6 šablona je postavená na stejných pravidlech jako fix v5 commit 031a672, plus
přidává PNG fallback pro vizuální identitu (aby Outlook desktop bez VML / Outlook
mobile / Gmail iOS bez @font-face viděly identický vzhled):

- **`background-clip:text` zakázáno**. Žádný gradient text fill, žádné
  `-webkit-text-fill-color:transparent`. Místo toho pevná barva (`#F8F4FF`,
  `#A855F7`, atd.) + `text-shadow:0 0 N px rgba(R,G,B,A)` glow tam, kde má být
  efekt. Bezpečné napříč klienty.
- **Každý `<td>` s background má atribut `bgcolor` i inline `background-color`**.
  Outlook desktop bere `bgcolor`, Gmail iOS bere inline `background-color`,
  ostatní klienti čtou oba. Žádná sekce se nesmí "převrátit" na světlou.
- **`<meta name="color-scheme" content="dark only">`** plus
  `<meta name="supported-color-schemes" content="dark only">`. Spolu s
  `:root{color-scheme:dark only}` a `[data-ogsc] td{background-color:#06050A !important}`
  to vypne Gmail iOS dark-mode auto-invert.
- **Žádné `#FFFFFF` / `#000000`**. Místo nich `#F8F4FF` / `#06050A` (palette).
  Pure black/white spustí dark-mode auto-invert na klientech, které jinak
  respektují color-scheme. `rgba(0,0,0,*)` se v šabloně používá výhradně v
  `text-shadow` jako drop-shadow, nikdy ne v background.
- **Žádný `BMON_LOGIN_BLOCK` ve v5 weekly plan emailu**. Reminder na obnovu
  hesla patří do separátního welcome flow, ne do týdenního plánu. `lib/mail.js`
  loginBlock stále generuje pro v2 / legacy, ale `weeklyPlanEmailV5.js` ho
  v5 šabloně ignoruje (varianta A z fix promptu).
- **Outlook MSO VML hero gradient** přes `<v:rect>` – Outlook desktop tak vidí
  diagonální gradient místo flat čerň.
- **`cellpadding="0" cellspacing="0" border="0"`** atributy na všech tabulkách
  (i když mají inline style) – povinné pro Outlook desktop.
- **Font stack** v inline stylech `'Geist',Arial,sans-serif`, plný stack
  `'Geist','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif`
  je v `<body>` přes `<style>` (dědí Gmail/Apple Mail; Outlook si stejně Geist
  nenačte a padne na Arial).

## Známá omezení v6

- **HTML size ~75–80 KB** pro plný 7-denní plán s 3 jídly (po minifikaci).
  Pod Gmail clip threshold (102 KB) → email se nikdy nezkracuje.
- **Geist font** – Geist se v emailu nahraje pouze v klientech, které
  respektují `@font-face` (Apple Mail, Gmail iOS s vlastním fontem off).
  Gmail web a Outlook si Geist nikdy nenahrají → fallback na Arial.
  Šablona má font-stack `'Geist',Arial,sans-serif`. V PNG bannerech je text
  vykreslený přes System.Drawing s "Segoe UI" / "Consolas" → identický napříč
  všemi klienty (text v PNG je rastr, ne webfont).
- **PNG vs CSS gradient** – v6 PNG bannery jsou JPG quality 70-72 a 1200px
  šířky (downscale na 600px container). U klientů s 4K displejem to může
  vypadat lehce komprimovaně oproti vector gradient. To je vědomá trade-off
  za 100% consistency napříč všemi klienty.
- **PNG cache & images disabled** – pokud uživatel má vypnuté obrázky v
  Gmail/Outlook, vidí pouze HTML část (alt textu + bulletproof tabulky).
  Všechny critical informace jsou v HTML, ne v PNG, takže obsahově to funguje
  i bez obrázků.
- **Asset host** – v6 PNG musí být dostupné z `https://app.bodyandmindon.cz/email-assets/v6/*.jpg`.
  Pokud Vercel deployment vyřadí starý public asset (rare), všechny historické
  emaily přijdou o vizuální banner. Asset URL je stabilní `/email-assets/v6/`
  takže nikdy neměň pojmenování bez nového v7.

## Známá omezení v5 (kept for reference)

- **HTML size ~125–130 KB** pro plný 7-denní plán s 3 jídly. Nad Gmail clip
  threshold; uživatel musí kliknout "Zobrazit celou zprávu" v Gmail web.
  v6 tento problém řeší díky PNG offloadu + kompaktnějšímu macros řádku.
- **VML gradient v Outlook desktop** je jen na hero sekci. Zbytek šablony
  v Outlook desktopu vidí flat-color sekce (žádné radial gradients).
