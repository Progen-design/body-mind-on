// /lib/macroBadgeStyles.js — shared macro badge colors (profile + email)

import { BM_ON_MACRO_COLORS } from './designTokens.js';

export { BM_ON_MACRO_COLORS };

export function macroAccentColor(role) {
  return BM_ON_MACRO_COLORS[role]?.accent || '#E2E8F0';
}

export function macroInlineStyle(role) {
  const cfg = BM_ON_MACRO_COLORS[role];
  if (!cfg) return '';
  return `color:${cfg.accent};font-weight:700;`;
}
