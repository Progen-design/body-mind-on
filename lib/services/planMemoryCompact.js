/**
 * Čisté funkce pro kompaktní coach/shared paměť do plánu — bez Supabase (vhodné pro testy a import z Node ESM).
 */

/** Typy sdílené paměti z lib/aiSharedMemory.js + obecné coach_* záznamy. */
const SHARED_PREFIX = 'shared_';

/**
 * Je typ paměti vhodný pro nápovědu jídelníčku / adherenci (ne raw chat).
 * @param {string} memoryType
 */
export function isPlanRelevantMemoryType(memoryType) {
  const t = String(memoryType || '').trim();
  if (!t) return false;
  if (t.startsWith(SHARED_PREFIX)) return true;
  if (t.toLowerCase().startsWith('coach_')) return true;
  return false;
}

/**
 * Z položek { type, content } sestaví krátký souhrn.
 * @param {Array<{ type: string, content: string }>} items
 * @param {{ maxItems?: number, maxTotalChars?: number, maxItemChars?: number }} options
 * @returns {{ summary: string, itemsUsed: number, truncated: boolean }}
 */
export function compactMemoryItemsForPlan(items, options = {}) {
  const maxItems = Number(options.maxItems) > 0 ? Number(options.maxItems) : 8;
  const maxTotalChars = Number(options.maxTotalChars) > 0 ? Number(options.maxTotalChars) : 1200;
  const maxItemChars = Number(options.maxItemChars) > 0 ? Number(options.maxItemChars) : 220;

  if (!Array.isArray(items) || items.length === 0) {
    return { summary: '', itemsUsed: 0, truncated: false };
  }

  const parts = [];
  let total = 0;
  let truncated = false;
  let used = 0;

  for (const row of items.slice(0, maxItems)) {
    if (!row || typeof row !== 'object') continue;
    const typ = String(row.type || '').slice(0, 80);
    let text = String(row.content || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (text.length > maxItemChars) {
      text = `${text.slice(0, maxItemChars)}…`;
      truncated = true;
    }
    const bit = `[${typ}] ${text}`;
    if (total + bit.length + 2 > maxTotalChars) {
      truncated = true;
      break;
    }
    parts.push(bit);
    total += bit.length + 2;
    used += 1;
  }

  return {
    summary: parts.join(' | '),
    itemsUsed: used,
    truncated,
  };
}
