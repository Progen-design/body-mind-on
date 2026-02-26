-- Přidat sloupec pro vnímanou náročnost tréninku (formulář „Zapsat trénink“)
-- Hodnoty: 'easy' | 'just_right' | 'hard' | 'too_hard' (volitelné)
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS perceived_difficulty text;
