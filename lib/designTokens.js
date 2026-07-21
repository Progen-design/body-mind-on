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

/**
 * Unified /profil action-button system (PRIMARY / SECONDARY / DESTRUCTIVE / CHIP).
 * Uses existing BM_ON tokens only — no new palette. Inject with <style jsx global>.
 */
export function buildProfileButtonSystemCss() {
  const c = BM_ON_DESIGN.colors;
  const r = BM_ON_DESIGN.radius;
  const primaryGrad = BM_ON_GRADIENTS.primaryButton;
  const base = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 16px;
    border-radius: ${r.button};
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    box-sizing: border-box;
    text-decoration: none;
    white-space: nowrap;
    transition: transform 0.15s ease, filter 0.15s ease, background 0.15s ease,
      border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease, color 0.15s ease;
  `;
  return `
/* —— base shape (all action buttons on /profil) —— */
.profile-main-workout-btn,
.plan-export-btn,
.plan-btn-order,
.plan-btn-share,
.plan-btn-raw-fallback,
.plan-meal-recipe-btn,
.plan-meal-secondary-btn,
.plan-meal-swap,
.plan-meal-pin,
.connect-btn,
.withings-actions button,
.habit-ui-btn--primary,
.daily-checkin-save,
.trial-upgrade-cta--button,
.prefs-primary-btn,
.prefs-secondary-btn,
.profile-progress-cta,
.avatar-crop-btn-confirm,
.avatar-crop-btn-cancel,
.profile-quick-nav-btn,
.logout,
.btn-ghost,
.btn-danger,
.modal-actions button,
.profile-today-cta,
.profile-today-link-btn,
.profile-today-change-workout-btn,
.profile-today-restore-btn,
.profile-today-exercise-btn,
.profile-today-recipe-btn,
.profile-today-secondary-btn,
.hero-prefs-btn,
.plan-goal-prefs-btn {
  ${base}
}

/* —— PRIMARY —— */
.profile-main-workout-btn,
.plan-export-btn,
.plan-btn-order,
.connect-btn:not(.secondary),
.withings-actions button:not(.secondary),
.habit-ui-btn--primary,
.daily-checkin-save,
.trial-upgrade-cta--button,
.trial-warning-row .trial-upgrade-cta--button,
.trial-upgrade-card--start .trial-upgrade-cta--button,
.trial-upgrade-card--club .trial-upgrade-cta--button,
.trial-upgrade-card--vip .trial-upgrade-cta--button,
.prefs-primary-btn,
.profile-progress-cta,
.avatar-crop-btn-confirm,
.modal-actions button[type="submit"]:not(.btn-danger) {
  background: ${primaryGrad} !important;
  color: #fff !important;
  border: 1px solid rgba(14, 165, 233, 0.45) !important;
  font-weight: 700 !important;
  box-shadow: 0 8px 20px rgba(14, 165, 233, 0.25);
}
.profile-main-workout-btn:hover:not(:disabled),
.plan-export-btn:hover:not(:disabled),
.plan-btn-order:hover:not(:disabled),
.connect-btn:not(.secondary):hover:not(:disabled),
.withings-actions button:not(.secondary):hover:not(:disabled),
.habit-ui-btn--primary:hover:not(:disabled),
.daily-checkin-save:hover:not(:disabled),
.trial-upgrade-cta--button:hover:not(:disabled),
.prefs-primary-btn:hover:not(:disabled),
.profile-progress-cta:hover:not(:disabled),
.avatar-crop-btn-confirm:hover:not(:disabled),
.modal-actions button[type="submit"]:not(.btn-danger):hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
  box-shadow: 0 12px 22px rgba(14, 165, 233, 0.32);
}

/* —— SECONDARY —— */
.profile-quick-nav-btn:not(.profile-quick-nav-btn-danger),
.logout:not(.logout-danger),
.btn-ghost,
.prefs-secondary-btn,
.connect-btn.secondary,
.withings-actions button.secondary,
.avatar-crop-btn-cancel,
.modal-actions button[type="button"]:not(.btn-danger),
.plan-meal-recipe-btn,
.plan-meal-secondary-btn,
.plan-meal-swap,
.plan-meal-pin,
.plan-btn-share,
.plan-btn-raw-fallback,
.profile-today-cta,
.profile-today-link-btn,
.profile-today-change-workout-btn,
.profile-today-restore-btn,
.profile-today-exercise-btn,
.profile-today-recipe-btn,
.profile-today-secondary-btn,
.hero-prefs-btn,
.plan-goal-prefs-btn {
  background: rgba(255, 255, 255, 0.08) !important;
  color: ${c.text} !important;
  border: 1px solid ${c.border} !important;
  font-weight: 600 !important;
  box-shadow: none !important;
  text-decoration: none !important;
}
.profile-quick-nav-btn:not(.profile-quick-nav-btn-danger):hover:not(:disabled),
.logout:not(.logout-danger):hover:not(:disabled),
.btn-ghost:hover:not(:disabled),
.prefs-secondary-btn:hover:not(:disabled),
.connect-btn.secondary:hover:not(:disabled),
.withings-actions button.secondary:hover:not(:disabled),
.avatar-crop-btn-cancel:hover:not(:disabled),
.modal-actions button[type="button"]:not(.btn-danger):hover:not(:disabled),
.plan-meal-recipe-btn:hover:not(:disabled),
.plan-meal-secondary-btn:hover:not(:disabled),
.plan-meal-swap:hover:not(:disabled),
.plan-meal-pin:hover:not(:disabled),
.plan-btn-share:hover:not(:disabled),
.plan-btn-raw-fallback:hover:not(:disabled),
.profile-today-cta:hover:not(:disabled),
.profile-today-link-btn:hover:not(:disabled),
.profile-today-change-workout-btn:hover:not(:disabled),
.profile-today-restore-btn:hover:not(:disabled),
.profile-today-exercise-btn:hover:not(:disabled),
.profile-today-recipe-btn:hover:not(:disabled),
.profile-today-secondary-btn:hover:not(:disabled),
.hero-prefs-btn:hover:not(:disabled),
.plan-goal-prefs-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12) !important;
  border-color: rgba(148, 163, 184, 0.4) !important;
  color: ${c.text} !important;
  transform: translateY(-1px);
  filter: none;
}
.plan-meal-pin-active,
.profile-today-secondary-btn--active {
  border-color: rgba(34, 197, 94, 0.55) !important;
  color: #bbf7d0 !important;
  background: rgba(34, 197, 94, 0.12) !important;
}

/* —— DESTRUCTIVE —— */
.profile-quick-nav-btn-danger,
.logout-danger,
.btn-danger,
.modal-actions .btn-danger {
  background: transparent !important;
  color: ${c.red} !important;
  border: 1px solid rgba(251, 113, 133, 0.55) !important;
  font-weight: 600 !important;
  box-shadow: none !important;
}
.profile-quick-nav-btn-danger:hover:not(:disabled),
.logout-danger:hover:not(:disabled),
.btn-danger:hover:not(:disabled),
.modal-actions .btn-danger:hover:not(:disabled) {
  background: rgba(251, 113, 133, 0.12) !important;
  border-color: rgba(251, 113, 133, 0.8) !important;
  color: #fecdd3 !important;
  transform: translateY(-1px);
  filter: none;
}

/* —— CHIP (rating / blocker choices) —— */
.habit-ui-btn--pill {
  min-height: 36px !important;
  padding: 0.4rem 0.9rem !important;
  border-radius: ${r.pill} !important;
  border: 1px solid ${c.border} !important;
  background: rgba(255, 255, 255, 0.06) !important;
  color: ${c.textMuted} !important;
  font-size: 0.85rem !important;
  font-weight: 600 !important;
  box-shadow: none !important;
}
.habit-ui-btn--pill-sm {
  min-height: 32px !important;
  padding: 0.28rem 0.65rem !important;
  font-size: 0.78rem !important;
}
.habit-ui-btn--pill:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1) !important;
  border-color: rgba(148, 163, 184, 0.4) !important;
  color: ${c.text} !important;
  transform: none;
}
.habit-ui-btn--pill.habit-ui-btn--pill-active,
.habit-ui-btn--pill-active {
  background: ${primaryGrad} !important;
  border-color: rgba(14, 165, 233, 0.45) !important;
  color: #fff !important;
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.22);
}

/* —— DISABLED (unified) —— */
.profile-main-workout-btn:disabled,
.plan-export-btn:disabled,
.plan-btn-order:disabled,
.plan-btn-share:disabled,
.connect-btn:disabled,
.withings-actions button:disabled,
.habit-ui-btn:disabled,
.daily-checkin-save:disabled,
.trial-upgrade-cta--button:disabled,
.trial-upgrade-cta--disabled,
.prefs-primary-btn:disabled,
.prefs-secondary-btn:disabled,
.profile-progress-cta:disabled,
.avatar-crop-btn-confirm:disabled,
.avatar-crop-btn-cancel:disabled,
.profile-quick-nav-btn:disabled,
.logout:disabled,
.btn-ghost:disabled,
.btn-danger:disabled,
.modal-actions button:disabled,
.profile-today-cta:disabled,
.profile-today-link-btn:disabled,
.profile-today-change-workout-btn:disabled,
.profile-today-restore-btn:disabled,
.profile-today-exercise-btn:disabled,
.profile-today-recipe-btn:disabled,
.profile-today-secondary-btn:disabled {
  opacity: 0.45 !important;
  cursor: not-allowed !important;
  transform: none !important;
  filter: none !important;
  box-shadow: none !important;
}
`;
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
  --bmon-red: ${c.red};
  --bmon-btn-primary: ${BM_ON_GRADIENTS.primaryButton};
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
