/**
 * Načte dokumenty pro agenta (trainer) z DB a vrátí je pro vložení do contextu.
 * Pravdivé napojení: žádný file search. Dokumenty jsou načteny server-side
 * a předány jako supporting_documents; agent je smí používat jako prioritu.
 *
 * @param {string} agentSlug - např. 'trainer'
 * @param {object} options - volitelně limit
 * @returns {Promise<Array<{ title: string, summary: string, key_facts?: string[], source_id?: string }>>}
 */
import { supabaseServer } from './supabaseServer';

const MAX_DOCUMENTS = 10;
const MAX_SUMMARY_CHARS = 2000;
const MAX_KEY_FACTS = 15;

export async function loadAgentDocumentsContext(agentSlug, options = {}) {
  const slug = (agentSlug || '').toLowerCase().trim();
  if (slug !== 'trainer') return [];

  const limit = Math.min(Number(options.limit) || MAX_DOCUMENTS, 20);

  try {
    const { data, error } = await supabaseServer
      .from('ai_supporting_documents')
      .select('id, title, summary, key_facts, source_id')
      .eq('agent_slug', slug)
      .eq('enabled', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) return [];
    const rows = data ?? [];

    return rows.map((d) => ({
      title: String(d.title || '').trim() || 'Dokument',
      summary: String(d.summary || '').trim().slice(0, MAX_SUMMARY_CHARS),
      key_facts: Array.isArray(d.key_facts)
        ? d.key_facts.filter((f) => typeof f === 'string').slice(0, MAX_KEY_FACTS)
        : undefined,
      source_id: d.source_id ? String(d.source_id).trim() : undefined,
    }));
  } catch {
    return [];
  }
}
