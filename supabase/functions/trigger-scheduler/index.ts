import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async (req)=>{
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const runs = parseInt(new URL(req.url).searchParams.get('runs') || '1');
  const delayMs = parseInt(new URL(req.url).searchParams.get('delay') || '8000');
  if (!cronSecret) {
    return new Response(JSON.stringify({
      error: 'CRON_SECRET not set'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  const results = [];
  for(let i = 0; i < runs; i++){
    if (i > 0) await new Promise((r)=>setTimeout(r, delayMs));
    try {
      const response = await fetch('https://app.bodyandmindon.cz/api/ai/run-scheduler', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + cronSecret
        }
      });
      const text = await response.text();
      let parsed = {};
      try {
        parsed = JSON.parse(text);
      } catch  {}
      results.push({
        run: i + 1,
        status: response.status,
        scheduler: parsed?.scheduler || parsed
      });
    } catch (err) {
      results.push({
        run: i + 1,
        error: err.message
      });
    }
  }
  return new Response(JSON.stringify({
    ok: true,
    runs: results
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
