// /lib/designTokens.js — unified Body & Mind ON visual tokens (profile, email, mobile)
import { EMAIL_SAFE_CONTAINER_MAX_PX, EMAIL_DESIGN_TOKENS } from './email/emailDesignTokens.js';

export const BM_ON_DESIGN = {
  colors: {
    bg: '#070B18',
    panel: '#111827',
    panelSoft: '#172033',
    border: 'rgba(148, 163, 184, 0.22)',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    textDim: '#64748B',
    purple: '#7C3AED',
    purpleSoft: '#A78BFA',
    blue: '#38BDF8',
    sky: '#0EA5E9',
    cyan: '#22D3EE',
    green: '#22C55E',
    yellow: '#FBBF24',
    red: '#FB7185',
    cardBg: '#121826',
    cardAlt: '#1E293B',
    footerBg: '#040308',
  },
  radius: {
    card: '18px',
    button: '12px',
    modal: '22px',
    pill: '999px',
  },
  shadow: {
    card: '0 18px 60px rgba(0,0,0,0.35)',
    panel: '0 20px 60px rgba(2, 6, 23, 0.5)',
  },
};

export const BM_ON_MACRO_COLORS = {
  kcal: { border: 'rgba(148, 163, 184, 0.35)', bg: 'rgba(23, 32, 51, 0.85)', accent: '#E2E8F0' },
  protein: { border: 'rgba(14, 165, 233, 0.65)', bg: 'rgba(14, 165, 233, 0.12)', accent: '#0EA5E9' },
  carbs: { border: 'rgba(34, 211, 238, 0.65)', bg: 'rgba(34, 211, 238, 0.12)', accent: '#22D3EE' },
  fat: { border: 'rgba(167, 139, 250, 0.65)', bg: 'rgba(167, 139, 250, 0.12)', accent: '#A78BFA' },
  fiber: { border: 'rgba(34, 197, 94, 0.65)', bg: 'rgba(34, 197, 94, 0.12)', accent: '#22C55E' },
};

export const BM_ON_GRADIENTS = {
  primaryButton: 'linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%)',
  heroPanel: 'linear-gradient(135deg, rgba(14, 165, 233, 0.22) 0%, rgba(167, 139, 250, 0.18) 100%)',
  dayHeader: 'linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%)',
  hairline: ['#0EA5E9', '#A78BFA', '#22D3EE'],
};

/** Email v8 palette aliases (backward compatible with emailV8Palette.js) */
export const EMAIL_V8_ALIASES = {
  PAGE_BG: BM_ON_DESIGN.colors.bg,
  CARD_BG: BM_ON_DESIGN.colors.cardBg,
  CARD_ALT: BM_ON_DESIGN.colors.cardAlt,
  TEXT_PRIMARY: '#E2E8F0',
  TEXT_SECONDARY: BM_ON_DESIGN.colors.textMuted,
  TEXT_MUTED: BM_ON_DESIGN.colors.textDim,
  TEXT_DIM: '#475569',
  SKY: BM_ON_DESIGN.colors.sky,
  LAVENDER: BM_ON_DESIGN.colors.purpleSoft,
  CYAN: BM_ON_DESIGN.colors.cyan,
  SUCCESS: '#10B981',
  WARNING: BM_ON_DESIGN.colors.yellow,
  HEADER_START: BM_ON_DESIGN.colors.sky,
  HEADER_END: BM_ON_DESIGN.colors.purpleSoft,
  HEADER_BG_FALLBACK: BM_ON_DESIGN.colors.sky,
  BORDER_SUBTLE: 'rgba(14,165,233,0.15)',
  BORDER_DEFAULT: 'rgba(14,165,233,0.25)',
  BORDER_ACCENT: 'rgba(14,165,233,0.4)',
  FOOTER_BG: BM_ON_DESIGN.colors.footerBg,
  INTENSITY_HARD: '#EF4444',
};

export const EMAIL_CONTAINER_MAX_PX = EMAIL_SAFE_CONTAINER_MAX_PX;
export const EMAIL_SAFE_TOKENS = EMAIL_DESIGN_TOKENS;

/** CSS fragment for PlanViewer macro pills */
export function buildMacroPillCss() {
  const lines = [];
  for (const [tone, cfg] of Object.entries(BM_ON_MACRO_COLORS)) {
    lines.push(`.plan-meal-macro-pill--${tone} {
    border-color: ${cfg.border};
    background: ${cfg.bg};
  }
  .plan-meal-macro-pill--${tone} .plan-meal-macro-pill-value {
    color: ${cfg.accent};
  }`);
  }
  return lines.join('\n');
}

export function primaryButtonCss(extra = '') {
  return `background: ${BM_ON_GRADIENTS.primaryButton}; color: #fff; border-radius: ${BM_ON_DESIGN.radius.button}; ${extra}`;
}

export function secondaryButtonCss(extra = '') {
  return `background: rgba(255,255,255,0.08); color: ${BM_ON_DESIGN.colors.textMuted}; border: 1px solid ${BM_ON_DESIGN.colors.border}; border-radius: ${BM_ON_DESIGN.radius.button}; ${extra}`;
}

export function cssVarBlock() {
  const c = BM_ON_DESIGN.colors;
  const r = BM_ON_DESIGN.radius;
  return `
  --bmon-bg: ${c.bg};
  --bmon-panel: ${c.panel};
  --bmon-panel-soft: ${c.panelSoft};
  --bmon-card-bg: ${c.cardBg};
  --bmon-card-border: ${c.cardAlt};
  --bmon-text: ${c.text};
  --bmon-text-muted: ${c.textMuted};
  --bmon-sky: ${c.sky};
  --bmon-lavender: ${c.purpleSoft};
  --bmon-cyan: ${c.cyan};
  --bmon-radius-card: ${r.card};
  --bmon-radius-button: ${r.button};
  --bmon-radius-modal: ${r.modal};
  --bmon-shadow-card: ${BM_ON_DESIGN.shadow.card};
  --profil-card-bg: ${c.cardBg};
  --profil-card-border: ${c.cardAlt};
  --profil-accent: ${c.sky};
  --profil-accent-light: ${c.purpleSoft};
  --profil-text-primary: #e2e8f0;
  `;
}
