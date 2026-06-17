/**
 * GET /api/recipe-from-catalog?id=123
 * Detail receptu z recipes_catalog (suroviny, postup, makra, obrázek) — bez Spoonacular.
 */
import { handleRecipeFromCatalogRequest } from '../../lib/recipeDetailFromCatalog';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }
  return handleRecipeFromCatalogRequest(req, res);
}
