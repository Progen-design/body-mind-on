# AI Email Modification Rules — BMON

Reference for any future change to the weekly plan HTML email (`lib/weeklyPlanEmailV8.js`, `lib/templates/bmon_weekly_plan_email_v8.html`, palette `lib/emailV8Palette.js`).

## Before changing anything

1. **Full visual audit:** render locally (`node scripts/render-weekly-email-v8-preview.mjs`), open the generated HTML in a browser, and list backgrounds per section (hero, profile, motto, rules, each day, CTA, footer).
2. **One palette, one mode:** production email is **dark only** (`color-scheme: dark only`). Do not mix large light panels with dark body content.
3. **Gmail / iOS:** every `<td>` with `background-color` in `style` must also have a matching **`bgcolor`** attribute (same hex). Gradients: set `bgcolor` to the **first gradient stop** so clients without `background-image` still show brand color, not white.

## Unified colors (v8)

Defined in `lib/emailV8Palette.js`. Prefer importing `V8` in the renderer over new hardcoded hex values.

- Page: `#0A1018`
- Cards: `#121826` (main), `#1E293B` (alt / macro rows / habits body)
- Text: `#E2E8F0`, `#94A3B8`, `#64748B`
- Brand: `#0EA5E9`, `#A78BFA`, `#22D3EE`
- Day header: `linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%)` with **white / rgba white** text; **day 1 full card and days 2–7 compact must share this header pattern.**
- Footer bar: `#040308`
- Optional exception: `#EF4444` for “hard” workout emphasis only.

## After changing colors or layout

1. Re-run `node scripts/render-weekly-email-v8-preview.mjs` (all variants must pass).
2. Confirm **≥ 7** occurrences of the day-header gradient in the HTML (one per day).
3. Grep for unexpected light backgrounds (e.g. `#F5F0FF`, `#F8FAFC` as large fills).
4. If `sendPlanEmail` / production: default template version is **`v8`** (`EMAIL_TEMPLATE_VERSION`); deploy and send a test message before calling the task done.

## Checklist before merge

- [ ] No light “page” sections inside the dark template.
- [ ] Day 1 and days 2–7 use the **same** header treatment (gradient strip + white typography; compact days include **Otevřít →** on the gradient).
- [ ] Meal / workout / daily total blocks use **`#121826`** with colored left border, not a different gray family than the outer day card.
- [ ] Web plan view (`/plan/[id]`) stays aligned with the email for header, CTA gradient, and card fills.

## If something cannot be fixed in-email

Do not claim completion. Report the client (e.g. Gmail iOS dark invert), the HTML fragment, and 2–3 concrete options (darker gradient, different `bgcolor`, removing a problematic rule).
