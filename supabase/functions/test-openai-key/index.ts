import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async (req)=>{
  const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'OPENAI_API_KEY not set in Supabase secrets',
      hasKey: false,
      hint: 'Add OPENAI_API_KEY to Supabase Edge Function Secrets'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'Reply with just: OK'
          }
        ],
        max_tokens: 5
      })
    });
    const data = await response.json();
    return new Response(JSON.stringify({
      hasKey: true,
      keyPrefix: apiKey.slice(0, 15) + '...',
      httpStatus: response.status,
      ok: response.ok,
      reply: response.ok ? data.choices?.[0]?.message?.content : null,
      error: response.ok ? null : data.error?.message || JSON.stringify(data)
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      hasKey: true,
      keyPrefix: apiKey.slice(0, 15) + '...',
      fetchError: err.message
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
