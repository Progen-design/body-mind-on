-- Sjednocení frekvence cvičení v body_metrics: jedna canonical hodnota (freq_choice jako text),
-- weekly_sessions_user vždy odvozené. Všechny hodnoty v DB ve formátu s pomlčkou (1-2x týdně, 2-3x týdně, 4-5x týdně).

-- 1) Normalizace existujícího freq_choice na pomlčku (en-dash U+2013 → hyphen)
UPDATE public.body_metrics
SET freq_choice = replace(freq_choice, chr(8211), '-')
WHERE freq_choice IS NOT NULL
  AND freq_choice != ''
  AND position(chr(8211) in freq_choice) > 0;

-- 2) Doplnění freq_choice z weekly_sessions_user tam, kde chybí
UPDATE public.body_metrics
SET freq_choice = CASE
  WHEN weekly_sessions_user = 1 THEN '1-2x týdně'
  WHEN weekly_sessions_user = 5 THEN '4-5x týdně'
  ELSE '2-3x týdně'
END
WHERE (freq_choice IS NULL OR trim(freq_choice) = '')
  AND weekly_sessions_user IS NOT NULL;

-- 3) Doplnění weekly_sessions_user z freq_choice tam, kde chybí
UPDATE public.body_metrics
SET weekly_sessions_user = CASE
  WHEN freq_choice LIKE '%1%' AND freq_choice LIKE '%2%' THEN 1
  WHEN freq_choice LIKE '%4%' OR freq_choice LIKE '%5%' THEN 5
  ELSE 3
END
WHERE weekly_sessions_user IS NULL
  AND freq_choice IS NOT NULL
  AND trim(freq_choice) != '';

COMMENT ON COLUMN public.body_metrics.freq_choice IS 'Canonical: 1-2x týdně | 2-3x týdně | 4-5x týdně (vždy pomlčka). Odpovídá hodnotám ve formulářích.';
COMMENT ON COLUMN public.body_metrics.weekly_sessions_user IS 'Odvozené z freq_choice: 1 | 3 | 5 (počet tréninků týdně). Drž v sync při zápisu.';
