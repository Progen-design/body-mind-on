-- Clear illustrative/none meal cache so re-enrichment uses improved image matching.
-- Keeps exact (Spoonacular) entries. Run once after deploying image-matching fixes.
DELETE FROM meal_metadata_cache
WHERE image_trust_level IN ('illustrative', 'none') OR image_trust_level IS NULL;
