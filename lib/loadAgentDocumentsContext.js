/**
 * Načte dokumenty pro agenta (trainer atd.) pro vložení do contextu.
 * Pravdivé napojení: žádný fake file search. Dokumenty jsou načteny server-side
 * a předány jako supporting_documents; agent je smí používat jako prioritu.
 *
 * @param {string} agentSlug - např. 'trainer'
 * @param {object} options - volitelně limit, source
 * @returns {Promise<Array<{ title: string, summary?: string, key_facts?: string[], source_id?: string }>>}
 */
const MAX_DOCUMENTS = 10;
const MAX_SUMMARY_CHARS = 2000;

export async function loadAgentDocumentsContext(agentSlug, options = {}) {
  const slug = (agentSlug || '').toLowerCase().trim();
  if (slug !== 'trainer') return [];

  // Var A: zatím prázdný seznam. Později lze načíst z Supabase tabulky
  // (např. agent_documents nebo knowledge_base) nebo ze storage.
  const limit = Math.min(Number(options.limit) || MAX_DOCUMENTS, 20);

  try {
    // Případná integrace: const { data } = await supabaseServer.from('agent_documents').select('title, summary, key_facts').eq('agent_slug', slug).limit(limit);
    const documents = [];
    return documents.slice(0, limit).map((d) => ({
      title: d.title || 'Dokument',
      summary: (d.summary || '').slice(0, MAX_SUMMARY_CHARS),
      key_facts: Array.isArray(d.key_facts) ? d.key_facts.slice(0, 15) : undefined,
      source_id: d.source_id || undefined,
    }));
  } catch {
    return [];
  }
}
