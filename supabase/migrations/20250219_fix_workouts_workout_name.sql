-- Přidat sloupec workout_name, pokud v tabulce workouts chybí (např. máš jen workout_type).
-- Pokud tabulka už má workout_name NOT NULL, tuto migraci nemusíš spouštět – API už hodnotu posílá.

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS workout_name text;

-- Volitelně: pro existující řádky, kde je workout_name NULL, nastavit výchozí hodnotu
UPDATE workouts SET workout_name = 'Ostatní' WHERE workout_name IS NULL;

-- Volitelně: nastavit NOT NULL až po doplnění (odkomentuj, pokud to chceš v DB vynutit)
-- ALTER TABLE workouts ALTER COLUMN workout_name SET NOT NULL;
