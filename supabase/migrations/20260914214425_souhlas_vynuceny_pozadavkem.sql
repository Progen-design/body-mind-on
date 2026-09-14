-- PROVENIENCE ZÁZNAMU O SOUHLASU.
--
-- Do 14. 9. 2026 volalo api/body-metrics.js zapisSouhlasy() bezpodmínečně a
-- zapisSouhlasy() si chybějící `druhy` doplnila celým DRUHY_SOUHLASU. Řádek
-- o souhlasu tedy vznikl ke každé registraci bez ohledu na to, jestli
-- požadavek jakýkoli souhlas nesl — smoke test to prokázal holým POSTem.
--
-- Historii nepřepisujeme. Řádky jen dostanou příznak, že vznikly před tím,
-- než server pole `souhlasy` začal vyžadovat.
--
-- APLIKOVÁNO v produkci 14. 9. 2026, razítko 20260914214425 (podle něj je
-- pojmenovaný i tenhle soubor). Ověřeno: 8 řádků označeno jako před kontrolou.

alter table public.souhlasy_uzivatelu
  add column if not exists zapsano_pred_kontrolou_pozadavku boolean not null default false;

-- Pořadí je podstatné: DEFAULT false platí pro všechno, co vznikne PO téhle
-- migraci, a UPDATE bez WHERE označí true právě ty řádky, které v tabulce
-- existují teď. Hranice je tím časová a nemusí se ručně dohledávat user_id.
update public.souhlasy_uzivatelu set zapsano_pred_kontrolou_pozadavku = true;

comment on column public.souhlasy_uzivatelu.zapsano_pred_kontrolou_pozadavku is
  'true = radek vznikl drive, nez server zacal vyzadovat pole "souhlasy" v pozadavku (do 14. 9. 2026). NEZNAMENA, ze uzivatel nesouhlasil — zaskrtavatko v registraci odeslani blokovalo, takze souhlas fakticky padl. Znamena, ze TENHLE ZAZNAM sam o sobe nedokazuje, ze ho vynutil pozadavek. Rozdil je v dukazni sile, ne v tom, co se stalo.';

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
do $$
declare
  v_sloupec boolean;
  v_stare bigint;
  v_nove bigint;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'souhlasy_uzivatelu'
      and column_name = 'zapsano_pred_kontrolou_pozadavku'
  ) into v_sloupec;
  if not v_sloupec then
    raise exception 'Sloupec zapsano_pred_kontrolou_pozadavku se nevytvoril.';
  end if;

  select count(*) filter (where zapsano_pred_kontrolou_pozadavku),
         count(*) filter (where not zapsano_pred_kontrolou_pozadavku)
    into v_stare, v_nove
    from public.souhlasy_uzivatelu;

  raise notice 'Souhlasy: % oznacenych jako pred kontrolou, % po kontrole.', v_stare, v_nove;
end $$;
