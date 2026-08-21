/**
 * Pure instruction step extraction (no Supabase / OpenAI).
 */

/**
 * @param {unknown} instructions
 * @returns {string[]}
 */
export function extractInstructionStepsEn(instructions) {
  if (!instructions) return [];
  if (Array.isArray(instructions)) {
    /** @type {string[]} */
    const out = [];
    for (const block of instructions) {
      if (typeof block === 'string' && block.trim()) {
        out.push(block.trim());
        continue;
      }
      if (block && typeof block === 'object' && Array.isArray(block.steps)) {
        for (const s of block.steps) {
          const t = String(s?.step ?? s?.instruction ?? '').trim();
          if (t) out.push(t);
        }
      }
    }
    if (out.length) return out;
    return instructions
      .map((s) => (typeof s === 'string' ? s.trim() : String(s?.step ?? '').trim()))
      .filter(Boolean);
  }
  if (typeof instructions === 'string' && instructions.trim()) {
    return [instructions.trim()];
  }
  return [];
}
