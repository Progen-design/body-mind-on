-- Odblokovani fronty generatoru po komplexni kontrole systemu 6. 9. 2026.
--
-- ZJISTENI: ze 43 polozek ve stavu 'failed' bylo 30 "model vratil davku, ale
-- zadny recept neprosel validaci" (to je normalni provoz, viz nize) a 13
-- konkretnich chyb. Z nich jen 5 byla chybejici surovina - a TRI Z PETI uz
-- dnes prochazeji, protoze aliasy a pantry pribyly az migracemi ze 4. 9.
-- (20260904090000). Ta selhani jsou tedy zastarala, ne aktualni.
--
--   surovina           stav dnes
--   cervena paprika    OK  - alias -> paprika (pantry)
--   rimsky kmin        OK  - pantry, seasoning
--   piniove orisky     OK  - alias -> pinove orisky
--   fetovy syr         CHYBI
--   varena repa        CHYBI
--
-- Tahle migrace doplnuje dva chybejici aliasy (plus tri zrejme varianty) a
-- vraci vsech pet polozek zpet do 'pending'.
--
-- POZNAMKA K 30 "zadny recept neprosel validaci": NENI to porucha. Merene
-- 6. 9.: generator zapsal 30 receptu a 21 zahodil na tvrdem stropu tuku
-- z bodu 8.13. Vyteznost ~59 %, ale prumerny podil tuku u novych receptu
-- klesl ze 48 % na 32,7 %. Polozky, kde padla cela davka, konci jako
-- 'failed' - je to cena za kvalitu, ne chyba k oprave.

insert into public.ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs) values
  ('fetovy syr',  'feta',        'fetový sýr'),
  ('syr feta',    'feta',        'sýr feta'),
  ('varena repa', 'cervena repa', 'vařená řepa'),
  ('pecena repa', 'cervena repa', 'pečená řepa'),
  ('repa',        'cervena repa', 'řepa')
on conflict do nothing;

update public.recipe_generation_queue
set stav = 'pending', posledni_chyba = null, pokusu = 0, updated_at = now()
where stav = 'failed'
  and posledni_chyba in ('červená paprika','římský kmín','piniové oříšky','fetový sýr','vařená řepa');
