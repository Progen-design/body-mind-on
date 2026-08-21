import { AccountProfile } from '../types';

/**
 * Účty dostupné na tomto zařízení. Reálné přihlášení zatím řeší
 * demo vrstva — přepnutí profilu i odhlášení ale běží přes stejné API,
 * takže napojení na Supabase Auth znamená jen výměnu AuthProvideru.
 */
export const availableAccounts: AccountProfile[] = [
  {
    id: 'acc-jan',
    name: 'Jan Novák / Příkopa',
    email: 'jan.prikopa@bodyandmindon.cz',
    role: 'Klient — Hypertrofie',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    membershipPlan: 'Premium Performance & Hypertrofy Protocol'
  },
  {
    id: 'acc-tereza',
    name: 'Tereza Marková',
    email: 'tereza.markova@bodyandmindon.cz',
    role: 'Klient — Redukce',
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
    membershipPlan: 'Body Recomposition Protocol'
  },
  {
    id: 'acc-coach',
    name: 'Martin Dvořák',
    email: 'martin.dvorak@bodyandmindon.cz',
    role: 'Trenér — správce klientů',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
    membershipPlan: 'Coach Console'
  }
];

export const defaultAccountId = availableAccounts[0].id;
