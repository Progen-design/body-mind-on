-- MAKRA SE UKLADAJI STEJNE JAKO KALORICKY CIL.
--
-- Do 23. 8. 2026 se persistoval jen `calories_target`. Makra se pocitala
-- znovu pri kazdem volani `calculateNutritionTargets` -- bylo to napsane
-- primo v komentari toho modulu. Bilkoviny vychazi z `vaha x 1.6` (resp.
-- 1.8 pri redukci a 2.0 pri nabirani), takze s kazdou zmenou vahy se zmenily
-- bilkoviny a jako zbytek i sacharidy.
--
-- Merene na produkci u uctu janprikopa@gmail.com: dva po sobe jdouci tydenni
-- plany, oba na 2164 kcal, ale
--   20. - 26. 8.   B 158 g / S 232 g / T 67 g
--   27. 8. - 2. 9. B 183 g / S 207 g / T 67 g
-- Rozdil 25 g bilkovin u tehoz cloveka. Jidelnicek se pokazde skladal podle
-- jineho cile a profil ukazoval jeste treti cislo, protoze si makra dopocital
-- z procent.
--
-- Cil vyzivy je rozhodnuti o cloveku, ne mezivysledek generatoru. Patri tedy
-- vedle `calories_target` a meni se jen tehdy, kdyz ho nekdo vedome zmeni --
-- pri registraci, tydennim prepoctu vahy nebo uprave v profilu.
alter table public.body_metrics
  add column if not exists protein_target_g integer,
  add column if not exists carbs_target_g   integer,
  add column if not exists fat_target_g     integer;

comment on column public.body_metrics.protein_target_g is
  'Denni cil bilkovin v gramech. Uklada se pri registraci vedle calories_target; prepocita se jen pri vedome zmene cile.';
comment on column public.body_metrics.carbs_target_g is
  'Denni cil sacharidu v gramech. Viz protein_target_g.';
comment on column public.body_metrics.fat_target_g is
  'Denni cil tuku v gramech. Viz protein_target_g.';

-- DOPLNENI MAKER UCTUM, KTERE VZNIKLY PRED ZAVEDENIM SLOUPCU.
--
-- Pouziva stejny vzorec jako lib/nutritionTargets.js, aby se hodnoty
-- shodovaly s tim, co by kod spocital. Zapisuje se jen tam, kde makra chybi
-- a kaloricky cil uz je -- ucet bez cile nema z ceho pocitat.
with vypocet as (
  select
    bm.id,
    bm.calories_target as kcal,
    least(320, greatest(70, round(
      coalesce(bm.weight_kg, 70) * case lower(coalesce(bm.goal, 'udrzovani'))
        when 'nabirani_svaly' then 2.0
        when 'redukce'        then 1.8
        else 1.6
      end
      + case when coalesce(
            array_length(string_to_array(nullif(bm.workout_days, ''), ','), 1),
            bm.weekly_sessions_user,
            3
          ) >= 5 then 5 else 0 end
    ))::int) as protein,
    least(200, greatest(35, round(bm.calories_target * 0.28 / 9))::int) as fat
  from public.body_metrics bm
  where bm.calories_target is not null
    and bm.protein_target_g is null
)
update public.body_metrics b
set protein_target_g = v.protein,
    fat_target_g     = v.fat,
    carbs_target_g   = least(700, greatest(40,
                         round((v.kcal - v.protein * 4 - v.fat * 9) / 4.0)::int))
from vypocet v
where b.id = v.id;
