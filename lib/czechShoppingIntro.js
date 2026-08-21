/**
 * České tvary pro úvod e-mailu s nákupním seznamem („na sobotu“, ne „na Sobota“).
 */

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Z řetězce typu „Sobota (25. 4.)“ nebo „Sobota“ vrátí tvar dne pro „na ...“. */
export function dayLabelToNaAccusative(dayLabel) {
  const raw = String(dayLabel || '').split('(')[0].trim().toLowerCase();
  const n = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (n.includes('pondeli')) return 'pondělí';
  if (n.includes('utery')) return 'úterý';
  if (n.includes('streda')) return 'středu';
  if (n.includes('ctvrtek')) return 'čtvrtek';
  if (n.includes('patek')) return 'pátek';
  if (n.includes('sobota')) return 'sobotu';
  if (n.includes('nedele')) return 'neděli';
  return raw || 'tento den';
}

/**
 * @param {string} dayLabel např. „Sobota (25. 4.)“
 * @param {string} [datePart] jen datum v závorce, pokud už máš
 */
export function buildShoppingListEmailIntro(dayLabel, datePart = '') {
  const prep = esc(dayLabelToNaAccusative(dayLabel));
  const m = String(dayLabel || '').match(/\(([^)]+)\)/);
  const dateRaw = (datePart && String(datePart).trim()) || (m ? m[1].trim() : '');
  const date = dateRaw ? esc(dateRaw) : '';
  const when = date ? `<strong>na ${prep}</strong> (${date})` : `<strong>na ${prep}</strong>`;
  return `Tady máš suroviny z tvého plánu ${when}:`;
}
