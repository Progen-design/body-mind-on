import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SPOON_KEY = Deno.env.get('SPOONACULAR_API_KEY') || '';
async function testQuery(query) {
  const url = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(query)}&number=1&apiKey=${SPOON_KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  const recipe = d.results?.[0];
  return {
    query,
    found: !!recipe,
    title: recipe?.title || null
  };
}
Deno.serve(async ()=>{
  const queries = [
    // Snidane - kratsi queries
    'scrambled eggs',
    'fried eggs',
    'boiled eggs',
    'oatmeal',
    'oatmeal banana',
    'overnight oats',
    'greek yogurt',
    'yogurt parfait',
    'cottage cheese',
    'avocado toast',
    'smoothie bowl',
    'protein pancakes',
    'granola yogurt',
    'muesli',
    // Obed
    'chicken rice',
    'grilled chicken',
    'salmon',
    'baked salmon',
    'beef stew',
    'ground beef rice',
    'lentils',
    'lentil curry',
    'pasta chicken',
    'tuna pasta',
    'turkey burger',
    'pork chops',
    'shrimp',
    'quinoa salad',
    // Vecere
    'tuna salad',
    'chicken salad',
    'greek salad chicken',
    'caesar salad',
    'omelette',
    'egg omelette',
    'cod',
    'tilapia',
    'salmon salad',
    'tofu stir fry'
  ];
  const results = [];
  for (const q of queries){
    const r = await testQuery(q);
    results.push(r);
    await new Promise((res)=>setTimeout(res, 200));
  }
  const working = results.filter((r)=>r.found);
  return new Response(JSON.stringify({
    total: queries.length,
    working: working.length,
    results: working.map((r)=>({
        query: r.query,
        title: r.title
      }))
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
