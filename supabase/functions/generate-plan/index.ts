import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
Deno.serve(async (req)=>{
  const { userId, taskId } = await req.json().catch(()=>({}));
  if (!userId || !taskId) {
    return new Response(JSON.stringify({
      error: 'userId and taskId required'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Nacti body_metrics uzivatele
  const { data: bm } = await sb.from('body_metrics').select('*').eq('user_id', userId).order('created_at', {
    ascending: false
  }).limit(1).single();
  if (!bm) {
    return new Response(JSON.stringify({
      error: 'no body_metrics'
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // Zavolej OpenAI
  const prompt = `Vytvor 7denni jidelnicek a treninkovy plan pro:
- Cil: ${bm.goal || 'zdravy zivotni styl'}
- Vaha: ${bm.weight_kg || 75}kg, Vyska: ${bm.height_cm || 175}cm, Vek: ${bm.age || 30}
- Aktivita: ${bm.activity_level || 'moderate'}

Vrat JSON:
{
  "targets": { "calories_per_day": number, "protein_g": number, "carbs_g": number, "fat_g": number },
  "meal_plan": {
    "meals_per_day": 3,
    "days": [
      { "day_name": "Pondeli", "meals": [
        { "type": "breakfast", "name_cs": string, "spoonacular_query": string },
        { "type": "lunch", "name_cs": string, "spoonacular_query": string },
        { "type": "dinner", "name_cs": string, "spoonacular_query": string }
      ]}
    ]
  },
  "workout_plan": {
    "days_per_week": 3,
    "days": [
      { "day_index": 0, "exercises": [
        { "canonical_key": string, "name_cs": string, "sets": number, "reps": number }
      ]}
    ]
  }
}`;
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: {
        type: 'json_object'
      },
      max_tokens: 3000
    })
  });
  const openaiData = await openaiRes.json();
  const rawJson = openaiData.choices?.[0]?.message?.content;
  if (!rawJson) {
    return new Response(JSON.stringify({
      error: 'OpenAI no content',
      openaiData
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  let plan;
  try {
    plan = JSON.parse(rawJson);
  } catch  {
    return new Response(JSON.stringify({
      error: 'JSON parse failed',
      rawJson: rawJson.slice(0, 200)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // Uloz plan do DB
  const validFrom = new Date();
  validFrom.setDate(validFrom.getDate() - validFrom.getDay() + 1); // Pondeli
  const validFromStr = validFrom.toISOString().split('T')[0];
  const validUntilStr = new Date(validFrom.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: user } = await sb.from('profiles').select('email').eq('id', userId).single();
  const email = user?.email || '';
  // Deaktivuj stary plan
  await sb.from('ai_generated_plans').update({
    is_active: false
  }).eq('user_id', userId).eq('is_active', true);
  // Vloz novy plan
  const structured = {
    ...plan,
    _diagnostics: {
      generation_source: 'openai',
      generated_at: new Date().toISOString()
    }
  };
  const { data: newPlan, error: insertError } = await sb.from('ai_generated_plans').insert({
    user_id: userId,
    email,
    valid_from: validFromStr,
    valid_until: validUntilStr,
    is_active: true,
    structured_plan_json: structured,
    plan_html: `<p>Plan vygenerovan pres AI. Jidelnicek: ${plan.meal_plan?.days?.[0]?.meals?.[0]?.name_cs || 'nactam...'}</p>`
  }).select('id').single();
  if (insertError) {
    return new Response(JSON.stringify({
      error: insertError.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  // Aktualizuj task jako completed
  await sb.from('ai_tasks').update({
    status: 'completed',
    processed_at: new Date().toISOString()
  }).eq('id', taskId);
  return new Response(JSON.stringify({
    ok: true,
    planId: newPlan?.id,
    source: 'openai',
    snidane: plan.meal_plan?.days?.[0]?.meals?.[0]?.name_cs
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
