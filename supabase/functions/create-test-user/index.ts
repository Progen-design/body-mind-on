import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
Deno.serve(async (req)=>{
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const email = 'prikopa@pro-security.cz';
  const password = 'Pr0g3n3r';
  // Vytvor uzivatele pres admin API
  const { data: userData, error: userError } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: 'Jan Prikopa',
      is_test_user: true
    }
  });
  if (userError) {
    return new Response(JSON.stringify({
      error: userError.message
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  const userId = userData.user.id;
  // Vytvor profil
  await sb.from('profiles').upsert({
    id: userId,
    email,
    name: 'Jan Prikopa (test)',
    daily_email: true
  });
  // Vytvor ON_CLUB membership
  await sb.from('memberships').upsert({
    user_id: userId,
    tier: 'ON_CLUB',
    status: 'active',
    started_at: new Date().toISOString(),
    notes: 'test user - prikopa@pro-security.cz'
  });
  // Vytvor body_metrics
  await sb.from('body_metrics').insert({
    user_id: userId,
    goal: 'fat_loss',
    weight_kg: 80,
    height_cm: 180,
    age: 35,
    activity_level: 'moderate',
    gender: 'male'
  });
  // Pridej initial_plan task
  const { data: task } = await sb.from('ai_tasks').insert({
    user_id: userId,
    agent_slug: 'trainer',
    task_type: 'initial_plan',
    status: 'pending',
    payload: {
      force_regenerate: true,
      is_test: true
    }
  }).select('id').single();
  return new Response(JSON.stringify({
    ok: true,
    userId,
    email,
    membership: 'ON_CLUB',
    taskId: task?.id,
    message: 'Test user created successfully'
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
