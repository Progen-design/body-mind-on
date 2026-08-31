-- ai_messages nese čas bez časové zóny, zprávy trenéra chodí uživateli
-- o dvě hodiny posunuté.
--
-- ZMĚŘENO 31. 8. 2026 v 15:15 na produkci, účet janprikopa+r01@gmail.com,
-- odpověď GET /api/profile:
--   coach_messages[0].created_at = "2026-08-31T00:04:30.12"
-- Za časem není žádná zóna. Prohlížeč takový řetězec bere jako lokální čas,
-- takže zprávu vzniklou v 00:04 UTC (= 02:04 v Praze) ukáže jako 00:04 —
-- přesně ten dvouhodinový posun, který uživatel hlásí. Viz docs/DALSI_KROK.md
-- 6.6.
--
-- Řetězec v ai_messages: coach_chat_messages.created_at je timestamptz
-- (20260823010000_coach_chat_messages.sql) a zobrazuje se správně;
-- ai_messages.created_at a ai_messages.delivered_at jsou timestamp without
-- time zone — jediné dva sloupce v tomhle řetězci bez zóny.
--
-- PROČ JE PŘEVOD JEDNOZNAČNÝ. `ai_messages` má RLS zapnuté a v repu k ní
-- není jediná policy pro anon/authenticated — číst i zapisovat do ní tedy
-- umí jen service_role, tedy výhradně server (supabaseServer.js), nikdy
-- klient a nikdy s ručně zadaným časem. `created_at` plní SQL default
-- now(); databázová session v Supabase běží v UTC, takže now() píše
-- aktuální čas v UTC. `delivered_at` dnes nezapisuje žádný kód v repu (grep
-- přes api/ i lib/ nenašel jediné místo) — je to nepoužívaný sloupec beze
-- writeru, ne zdroj rozdílných formátů. Kdyby v budoucnu hodnotu dostal,
-- půjde stejnou server-only cestou přes stejnou UTC session, tedy taky
-- v UTC. `at time zone 'utc'` níž proto jen existující hodnoty OTAGUJE jako
-- UTC, nepřepočítává je — žádná hodnota se touto migrací nezmění, jen
-- přestane být nejednoznačná.
--
-- DEFAULT now() U created_at SE NEMĚNÍ CO DO VÝZNAMU. now() vrací
-- timestamptz nativně; dřív ho Postgres při zápisu do timestamp without
-- time zone potichu zúžil na "místní" čas session (= UTC), teď se do
-- timestamptz uloží beze změny. Stejný okamžik, stejná hodnota, akorát
-- správně otagovaná. `delivered_at` default nemá (je NULL, dokud ho něco
-- nenastaví) — po migraci zůstává stejně bez defaultu.
alter table public.ai_messages
  alter column created_at type timestamptz
  using created_at at time zone 'utc';

alter table public.ai_messages
  alter column delivered_at type timestamptz
  using delivered_at at time zone 'utc';
