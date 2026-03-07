import { supabaseServer } from './supabaseServer';

export async function getAIConfig() {
  const fallback = {
    model: 'gpt-4.1',
    system_prompt:
      'Jsi Body & Mind ON – AI trenér výživy, tréninku a výživy. Piš česky.',
    temperature: 0.2,
  };

  try {
    const { data, error } = await supabaseServer
      .from('ai_config')
      .select('*')
      .limit(1)
      .order('updated_at', { ascending: false })
      .maybeSingle();

    if (error || !data) {
      return fallback;
    }

    return {
      model: data.model ?? fallback.model,
      system_prompt: data.system_prompt ?? fallback.system_prompt,
      temperature: data.temperature ?? fallback.temperature,
    };
  } catch (err) {
    return fallback;
  }
}
