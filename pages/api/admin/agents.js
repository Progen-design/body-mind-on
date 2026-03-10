// GET = seznam agentů, PATCH = aktualizace jednoho (key=ADMIN_TOKEN v query nebo body)
import { supabaseServer } from '../../../lib/supabaseServer';

function isAdmin(req) {
  const key = req.query?.key || req.body?.key || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return process.env.ADMIN_TOKEN && key === process.env.ADMIN_TOKEN;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Neoprávněný přístup' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseServer
      .from('ai_agents')
      .select('id, slug, name, model, system_prompt, temperature, enabled, created_at, updated_at')
      .order('slug');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ agents: data || [] });
  }

  if (req.method === 'PATCH') {
    const { slug, name, model, system_prompt, temperature, enabled } = req.body || {};
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'Chybí slug agenta' });
    }
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = String(name);
    if (model !== undefined) updates.model = String(model);
    if (system_prompt !== undefined) updates.system_prompt = String(system_prompt);
    if (temperature !== undefined) updates.temperature = Number(temperature);
    if (typeof enabled === 'boolean') updates.enabled = enabled;

    const { data, error } = await supabaseServer
      .from('ai_agents')
      .update(updates)
      .eq('slug', slug.trim())
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Agent nenalezen' });
    return res.status(200).json({ agent: data });
  }
}
