-- Plán, který je vidět, ale ještě nepatří uživateli.
--
-- PROČ. Po konci trialu svítí člověku starý propadlý plán bez označení
-- a nemá kde zaplatit. Nula ze tří trialů konvertovala. Chybí to jediné,
-- co stojí mezi produktem a penězi: ukázat, co dostane, a nechat ho koupit.
--
-- Plán se skládá z katalogu deterministicky (`OPENAI_PLAN_ENABLED` je false),
-- takže další týden navíc nestojí za recepty nic.
--
-- `locked` znamená JEN „vzniklo jako ukázka". Jestli je plán opravdu zamčený,
-- se rozhoduje AŽ PŘI ČTENÍ podle živého členství (`canRenewPlanForMembership`),
-- takže zaplacením se odemkne sám a nemusí ho nikdo přepisovat.
--
-- `is_active` zůstává false: zamčený týden NESMÍ nahradit ten, který uživatel
-- právě má. Je to nabídka vedle, ne výměna.

alter table public.ai_generated_plans
  add column if not exists locked boolean not null default false;

comment on column public.ai_generated_plans.locked is
  'true = plan vznikl jako ukazka pro nekoho, kdo si ho zatim nemuze nechat '
  'vygenerovat (trial). Skutecny zamek se pocita az pri cteni podle clenstvi.';

-- Hledá se přes (user_id, locked) při každém načtení profilu.
create index if not exists ai_generated_plans_locked_idx
  on public.ai_generated_plans (user_id, valid_from)
  where locked;

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
BEGIN
  -- Zamek nesmi byt NULL — trojhodnotova logika by v UI znamenala treti stav,
  -- ktery nikdo nevykresli.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ai_generated_plans'
       AND column_name = 'locked' AND is_nullable <> 'NO'
  ) THEN
    RAISE EXCEPTION 'sloupec locked musi byt NOT NULL';
  END IF;

  -- Migrace nesmi nic zamknout zpetne.
  IF EXISTS (SELECT 1 FROM public.ai_generated_plans WHERE locked) THEN
    RAISE EXCEPTION 'migrace zamkla existujici plany';
  END IF;
END $$;
