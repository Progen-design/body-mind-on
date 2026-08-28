import React from 'react';
import type { UserProfile } from '../types';

interface MembershipStatusBadgeProps {
  status: UserProfile['status'];
  /** Kolik dní zbývá do konce trialu. Ignoruje se mimo `status: 'TRIAL'`. */
  trialDniDoKonce?: number | null;
  /** `card` = UserProfileCard (menší pilulka), `section` = ProfileSection (větší). */
  variant?: 'card' | 'section';
}

/**
 * Odpočet dní do konce trialu jako text pilulky.
 *
 * Do 29. 8. 2026 stav `trial` ukazoval „AKTIVNÍ" až do posledního dne —
 * člověk se o konci dozvěděl tím, že mu přestal chodit plán.
 */
function textOdpoctu(dny: number): string {
  if (dny <= 0) return 'DNES';
  if (dny === 1) return '1 DEN';
  if (dny < 5) return `${dny} DNY`;
  return `${dny} DNÍ`;
}

const BARVY: Record<UserProfile['status'], string> = {
  'AKTIVNÍ': 'text-[#39ff14] border-[#39ff14]/50',
  'VIP': 'text-[#39ff14] border-[#39ff14]/50',
  'TRIAL': 'text-amber-300 border-amber-400/50',
  'PAUZOVÁNO': 'text-slate-400 border-slate-500/40',
};

const TECKA: Record<UserProfile['status'], string> = {
  'AKTIVNÍ': 'bg-[#39ff14]',
  'VIP': 'bg-[#39ff14]',
  'TRIAL': 'bg-amber-300',
  'PAUZOVÁNO': 'bg-slate-500',
};

const POZADI: Record<UserProfile['status'], string> = {
  'AKTIVNÍ': 'bg-emerald-950',
  'VIP': 'bg-emerald-950',
  'TRIAL': 'bg-amber-950',
  'PAUZOVÁNO': 'bg-slate-800',
};

const STIN: Record<UserProfile['status'], string> = {
  'AKTIVNÍ': 'rgba(57,255,20,0.25)',
  'VIP': 'rgba(57,255,20,0.25)',
  'TRIAL': 'rgba(251,191,36,0.25)',
  'PAUZOVÁNO': 'transparent',
};

export const MembershipStatusBadge: React.FC<MembershipStatusBadgeProps> = ({
  status,
  trialDniDoKonce,
  variant = 'section',
}) => {
  const dny = status === 'TRIAL' && trialDniDoKonce != null ? trialDniDoKonce : null;
  const rozmery = variant === 'card'
    ? 'px-3.5 py-1.5 tracking-wide select-none'
    : 'px-3 py-1 tracking-wider';
  const pozadiOpacity = variant === 'card' ? '/40' : '/60';

  return (
    <div
      className={`rounded-full text-xs font-bold uppercase flex items-center gap-1.5 border ${rozmery} ${POZADI[status]}${pozadiOpacity} ${BARVY[status]}`}
      style={{ boxShadow: STIN[status] === 'transparent' ? undefined : `0 0 ${variant === 'card' ? 15 : 12}px ${STIN[status]}` }}
    >
      <span className={`w-1.5 h-1.5 rounded-full animate-ping ${TECKA[status]}`} />
      <span>{status}{dny != null ? ` · ${textOdpoctu(dny)}` : ''}</span>
    </div>
  );
};
