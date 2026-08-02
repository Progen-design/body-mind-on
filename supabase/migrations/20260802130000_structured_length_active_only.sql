-- Srovnání významu prep_minutes_estimated napříč zdroji.
--
-- Po migraci 20260802120000 znamená prep_minutes_estimated AKTIVNÍ čas — jenže
-- to platilo jen pro zdroj 'llm', kde model vrací active_minutes zvlášť. Zdroj
-- 'structured_length' zůstal součtem délek VŠECH kroků včetně pasivních, takže
-- „PB and J Overnight Oatmeal“ měl 720 minut (12 h namáčení) a „Quinoa and
-- Chickpea Salad“ 1080 minut (18 h). Jeden sloupec, dva různé významy.
--
-- Časová podmínka čte coalesce(ready_in_minutes, prep_minutes_estimated) a bez
-- téhle opravy by 55 aktivních receptů vyřadila za noční namáčení — přesně ta
-- chyba, kvůli které se přegenerovávaly llm odhady.
--
-- Rozdělení je deterministické, ze stejných dat jako původní backfill: krok se
-- počítá jako pasivní, když jeho text odpovídá PASSIVE_WAIT_REGEX z
-- lib/spoonacular/prepTimeEstimate.js. Vyhazuje se celá délka kroku, i když
-- v něm kus aktivní práce je — spodní mez tím klesne, což je bezpečný směr.
--
-- Postgres ARE bere \b jako backspace, hranice slova je \y.

WITH kroky AS (
  SELECT r.id,
         CASE WHEN lower(coalesce(s->'length'->>'unit','minutes')) LIKE 'hour%'
              THEN (s->'length'->>'number')::numeric * 60
              ELSE (s->'length'->>'number')::numeric END AS minut,
         (s->>'step') ~* '\yovernight\y|\ychill(ed|ing|s)?\y|\yfreez(e|er|ing)\y|\yfrozen\y|\ysoak(ed|ing|s)?\y|\yrefrigerat(e|ed|ing|or)\y|\yfridge\y|\ymarinat(e|ed|ing)\y|\ymacerat(e|ed|ing)\y|\yproof(ing)?\y|\y(rise|risen|rising)\y|\ylet\y[^.]{0,40}\y(sit|stand|rest)\y' AS je_pasivni
  FROM public.recipes_catalog r
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.instructions,'[]'::jsonb)) b
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(b->'steps','[]'::jsonb)) s
  WHERE r.prep_minutes_source = 'structured_length'
    AND s->'length'->>'number' IS NOT NULL
), souhrn AS (
  SELECT id,
         ceil(sum(minut) FILTER (WHERE NOT je_pasivni))::integer AS aktivni,
         ceil(coalesce(sum(minut) FILTER (WHERE je_pasivni), 0))::integer AS pasivni
  FROM kroky GROUP BY id
)
UPDATE public.recipes_catalog r
SET prep_minutes_estimated = souhrn.aktivni,
    prep_minutes_passive   = souhrn.pasivni
FROM souhrn
WHERE r.id = souhrn.id
  AND souhrn.aktivni IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Recepty, kde délku uvádějí VÝHRADNĚ pasivní kroky (11 kusů).
--
-- Aktivní čas by vyšel NULL — ne nula, ale „neznáme“. Nechat je s prázdným
-- odhadem by je časová podmínka vyřadila, přestože postup mají. Uvolní se tedy
-- pro LLM odhad (--run je bere podle prep_minutes_estimated IS NULL); pasivní
-- část si drží, ta je změřená.
-- ---------------------------------------------------------------------------
WITH kroky AS (
  SELECT r.id,
         CASE WHEN lower(coalesce(s->'length'->>'unit','minutes')) LIKE 'hour%'
              THEN (s->'length'->>'number')::numeric * 60
              ELSE (s->'length'->>'number')::numeric END AS minut,
         (s->>'step') ~* '\yovernight\y|\ychill(ed|ing|s)?\y|\yfreez(e|er|ing)\y|\yfrozen\y|\ysoak(ed|ing|s)?\y|\yrefrigerat(e|ed|ing|or)\y|\yfridge\y|\ymarinat(e|ed|ing)\y|\ymacerat(e|ed|ing)\y|\yproof(ing)?\y|\y(rise|risen|rising)\y|\ylet\y[^.]{0,40}\y(sit|stand|rest)\y' AS je_pasivni
  FROM public.recipes_catalog r
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.instructions,'[]'::jsonb)) b
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(b->'steps','[]'::jsonb)) s
  WHERE r.prep_minutes_source = 'structured_length'
    AND s->'length'->>'number' IS NOT NULL
), jen_pasivni AS (
  SELECT id, ceil(sum(minut))::integer AS pasivni
  FROM kroky GROUP BY id
  HAVING count(*) FILTER (WHERE NOT je_pasivni) = 0
)
UPDATE public.recipes_catalog r
SET prep_minutes_estimated = NULL,
    prep_minutes_source    = NULL,
    prep_minutes_passive   = jen_pasivni.pasivni
FROM jen_pasivni
WHERE r.id = jen_pasivni.id;

-- ---------------------------------------------------------------------------
-- Kontrola: nic se zdrojem structured_length nesmí zůstat bez aktivního času.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_bez_casu integer;
BEGIN
  SELECT count(*) INTO v_bez_casu
  FROM public.recipes_catalog
  WHERE prep_minutes_source = 'structured_length' AND prep_minutes_estimated IS NULL;

  IF v_bez_casu <> 0 THEN
    RAISE EXCEPTION 'Receptu structured_length bez aktivniho casu je %, cekali jsme 0.', v_bez_casu;
  END IF;
END $$;
