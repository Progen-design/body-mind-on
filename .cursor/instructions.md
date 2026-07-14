# Body & Mind ON – Project Rules

Project:
- Name: Body & Mind ON
- Type: Fitness / AI / Automation
- Owner: single developer

Stack:
- Next.js (pages router)
- Vercel hosting
- Supabase backend
- JavaScript (no forced TypeScript unless already present)

General rules:
- ALWAYS return complete files when editing code
- NEVER remove existing functionality unless explicitly instructed
- Prefer simple and readable solutions over abstractions
- Do not refactor unrelated parts of the project
- Do not introduce new libraries without approval
- Do not change existing text/content unless explicitly instructed

Emails:
- Emails must be sent as valid HTML
- Never escape HTML into plain text
- Keep email structure simple and compatible with Gmail
- All email content must be in Czech

Code structure:
- Business logic belongs in /lib
- React components should stay clean (UI only)
- API routes live in /pages/api

START flow (dotazník → e-mail s plánem):
- Formulář na /start volá pouze POST /api/body-metrics; e-mail s plánem jde přes lib/generatePlan.js a lib/mail.js
- Při úpravách pages/start.js, pages/api/body-metrics.js, lib/generatePlan.js nebo lib/mail.js zachovat tento tok
- Detailní popis: FLOW_START_DOTAZNIK.md v kořeni projektu

Deployment:
- Code must be compatible with Vercel (serverless)
- Avoid Node-only APIs unless used inside API routes

AI behavior:
- If multiple solutions exist, propose the simplest one
- Prefer minimal changes over rewrites

When unsure:
- First explain what you are going to do and why
- Then provide the full updated file

Copy (chytrá zařízení):
- Před úpravou uživatelských textů si přečti **docs/copy-rules.md**
- Po změnách copy spusť `npm run lint:copy`
