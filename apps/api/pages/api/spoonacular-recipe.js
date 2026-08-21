/**
 * GET /api/spoonacular-recipe?id=123
 * Legacy alias — přesměrovává na recipes_catalog (žádné Spoonacular HTTP).
 * @deprecated Používej /api/recipe-from-catalog
 */
import { handleRecipeFromCatalogRequest } from '../../lib/recipeDetailFromCatalog';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }
  return handleRecipeFromCatalogRequest(req, res);
}
