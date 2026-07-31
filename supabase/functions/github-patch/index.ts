import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Tato funkce nacte taskExecutors.js z GitHub a vrati relevantni cast kolem skipped_existing_valid_plan
Deno.serve(async (req)=>{
  const ghToken = Deno.env.get('GITHUB_TOKEN') || '';
  if (!ghToken) {
    return new Response(JSON.stringify({
      error: 'GITHUB_TOKEN not set'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  const response = await fetch('https://api.github.com/repos/Progen-design/body-mind-on/contents/lib/taskExecutors.js', {
    headers: {
      'Authorization': 'Bearer ' + ghToken,
      'Accept': 'application/vnd.github.raw'
    }
  });
  if (!response.ok) {
    return new Response(JSON.stringify({
      error: response.statusText,
      status: response.status
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  const code = await response.text();
  const lines = code.split('\n');
  const idx = lines.findIndex((l)=>l.includes('skipped_existing_valid_plan'));
  const snippet = lines.slice(Math.max(0, idx - 20), idx + 10).join('\n');
  return new Response(JSON.stringify({
    total_lines: lines.length,
    skip_line: idx + 1,
    snippet
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
