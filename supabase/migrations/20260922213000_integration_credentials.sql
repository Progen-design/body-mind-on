-- OAUTH PŘIHLAŠOVACÍ ÚDAJE INTEGRACÍ (22. 9. 2026).
--
-- PROČ. Client ID a Secret aplikace registrované u Withings se daly zadat
-- jedině jako env proměnné ve Vercelu, takže každá změna znamenala cestu do
-- cizího dashboardu a redeploy. Admin stránka `/admin/integrace` je zapisuje
-- sem; `getWithingsConfig()` (lib/withingsServer.js) je odsud čte a na env
-- proměnné spadne jen tehdy, když tu řádek není.
--
-- TOHLE NEJSOU ÚDAJE UŽIVATELE. Uživatel žádné klientské údaje nikdy
-- nezadává — klikne „Připojit Withings" a jde přes OAuth. Tabulka drží
-- identitu NAŠÍ aplikace vůči poskytovateli, jednu pro všechny. Proto
-- `integration_key` jako primární klíč: jeden řádek na integraci, ne na
-- uživatele.
--
-- ŠIFROVANÉ, NE V PLAINTEXTU. Oba sloupce nesou výstup `encryptSecret()`
-- (lib/secretBox.js) — týž AES-256-GCM a týž kořenový klíč z env, jakým se
-- šifrují OAuth tokeny ve `withings_connections`. Tvar jsonb je součást
-- datového kontraktu: { v, alg, iv, tag, data }.
--
-- RLS JE ZAVŘENÁ ÚPLNĚ. Žádná politika pro `anon` ani `authenticated` —
-- stejně jako u `withings_connections` sem smí jedině `service_role`, tedy
-- serverové endpointy. Klientský Supabase klíč tu nesmí přečíst ani řádek;
-- i zašifrovaný secret je tajemství, které se nemá rozdávat.
--
-- APLIKOVÁNO v produkci 22. 9. 2026 (projekt ipfyavvmmxmsjupmfnes).
--
-- Nešlo přes `supabase db push`: vzdálená historie migrací obsahuje 22 verzí,
-- které v `supabase/migrations/` nejsou, a push proto odmítne běžet dřív, než
-- se historie srovná (`supabase migration repair` / `db pull`). To je starší
-- rozjetá věc, ne problém téhle migrace — tenhle jeden soubor se aplikoval
-- samostatně. Advisors po aplikaci nehlásí na tabulku nic.

CREATE TABLE IF NOT EXISTS public.integration_credentials (
  integration_key text PRIMARY KEY,
  client_id_encrypted jsonb,
  client_secret_encrypted jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.integration_credentials OWNER TO postgres;

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

-- Jediná politika, jediná role. `USING (true)` tu neznamená „pro všechny" —
-- platí výhradně pro `service_role`, který RLS stejně obchází; je tu proto,
-- aby bylo v gitu vidět, kdo k tabulce smí.
DROP POLICY IF EXISTS integration_credentials_service_role_all ON public.integration_credentials;
CREATE POLICY integration_credentials_service_role_all
  ON public.integration_credentials
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.integration_credentials FROM PUBLIC;
REVOKE ALL ON TABLE public.integration_credentials FROM anon;
REVOKE ALL ON TABLE public.integration_credentials FROM authenticated;
GRANT ALL ON TABLE public.integration_credentials TO service_role;

COMMENT ON TABLE public.integration_credentials IS
  'OAuth klientské údaje NAŠÍ aplikace vůči poskytovateli (dnes Withings), zašifrované přes lib/secretBox.js. Jeden řádek na integraci, ne na uživatele. Zapisuje admin stránka /admin/integrace přes api/admin/integrations/withings.js; čte getWithingsConfig() s fallbackem na env.';

COMMENT ON COLUMN public.integration_credentials.client_secret_encrypted IS
  'AES-256-GCM { v, alg, iv, tag, data } — nikdy se nevrací zpátky do UI, ani zašifrovaný.';
