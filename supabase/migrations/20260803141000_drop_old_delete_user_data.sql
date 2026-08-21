-- Zahodit starou jednoparametrovou delete_user_data.
--
-- CREATE OR REPLACE s jinou signaturou nenahradilo puvodni funkci, ale
-- vytvorilo druhou. V databazi tak vedle sebe stály delete_user_data(uuid)
-- a delete_user_data(uuid, text) — a volani s jednim argumentem se v Postgresu
-- napáruje na přesnou shodu, tedy na tu STAROU a neúplnou. Migrace
-- 20260803140000 by tím pádem sama o sobě neopravila vůbec nic.
--
-- Poznámka na příště: u opravy funkce, která mění signaturu, patří DROP
-- staré verze do stejné migrace.

DROP FUNCTION IF EXISTS public.delete_user_data(uuid);
