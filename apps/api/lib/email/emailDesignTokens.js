/**
 * Email-safe design tokens shared by all plan e-mail renderers.
 * Keep values conservative for Gmail / Outlook / Apple Mail compatibility.
 */

export const EMAIL_SAFE_CONTAINER_MAX_PX = 640;

export const EMAIL_FONTS = {
  body: 'Arial,Helvetica,sans-serif',
  mono: "'Courier New',monospace",
  legacySans: 'Arial,Helvetica,sans-serif',
};

export const EMAIL_DESIGN_TOKENS = {
  colors: {
    pageBg: '#0A1018',
    cardBg: '#121826',
    cardAlt: '#1E293B',
    footerBg: '#040308',
    textPrimary: '#E2E8F0',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textDim: '#475569',
    sky: '#0EA5E9',
    lavender: '#A78BFA',
    cyan: '#22D3EE',
    success: '#10B981',
    warning: '#FBBF24',
    danger: '#EF4444',
    legacyText: '#e8ecf4',
    legacyMuted: '#94a3b8',
    legacyCard: '#14121f',
    legacyBg: '#0a0814',
    legacyAccent: '#a78bfa',
    legacyAccentDeep: '#7c3aed',
  },
  radius: {
    card: 16,
    medium: 12,
    small: 10,
    tiny: 8,
    pill: 999,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
};

