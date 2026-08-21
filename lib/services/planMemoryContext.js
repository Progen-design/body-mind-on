/**
 * Kompaktní kontext z user_ai_memory pro unified plan pipeline (coach + shared facts).
 * Tvrdé limity — žádné celé konverzace, žádné plan_html.
 */

import { getSharedMemory, getAgentSpecificMemory } from '../aiSharedMemory.js';
import { compactMemoryItemsForPlan, isPlanRelevantMemoryType } from './planMemoryCompact.js';

export { compactMemoryItemsForPlan, isPlanRelevantMemoryType } from './planMemoryCompact.js';

/**
 * Načte omezený počet záznamů z DB a vrátí kompaktní souhrn pro GPT (žádné PII).
 * @param {string} userId
 * @returns {Promise<{ summary: string, itemsUsed: number, truncated: boolean }>}
 */
export async function buildPlanMemoryContext(userId) {
  if (!userId || typeof userId !== 'string') {
    return { summary: '', itemsUsed: 0, truncated: false };
  }

  try {
    const [sharedRows, coachRows] = await Promise.all([
      getSharedMemory(userId, 10),
      getAgentSpecificMemory(userId, 'coach', 10),
    ]);

    const merged = [];

    for (const r of sharedRows || []) {
      if (!isPlanRelevantMemoryType(r.type)) continue;
      merged.push({
        type: r.type,
        content: r.content,
        at: r.created_at,
      });
    }
    for (const r of coachRows || []) {
      if (!isPlanRelevantMemoryType(r.type)) continue;
      merged.push({
        type: r.type,
        content: r.content,
        at: r.created_at,
      });
    }

    merged.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

    const seen = new Set();
    const deduped = [];
    for (const r of merged) {
      const key = r.type;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({ type: r.type, content: r.content });
      if (deduped.length >= 12) break;
    }

    return compactMemoryItemsForPlan(deduped, {
      maxItems: 8,
      maxTotalChars: 1200,
      maxItemChars: 220,
    });
  } catch {
    return { summary: '', itemsUsed: 0, truncated: false };
  }
}
