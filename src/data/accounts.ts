import type { AccountProfile } from '../types';

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

/** Výchozí profil — sem se spadne, když uložené id nedává smysl. */
export const defaultAccount: AccountProfile = availableAccounts[0];

/**
 * Starší nebo cizí identifikátory téhož člověka. Kanonické id zůstává
 * `acc-jan` schválně: data v localStorage jsou klíčovaná účtem
 * (`bmon:v1:acc-jan:meals`), takže přejmenování id by uživateli
 * odřízlo všechno, co má uložené.
 */
const ACCOUNT_ID_ALIASES: Record<string, string> = {
  'jan-prikopa': 'acc-jan',
  'jan-novak': 'acc-jan',
  'jan.prikopa': 'acc-jan',
  'tereza-markova': 'acc-tereza',
  'martin-dvorak': 'acc-coach'
};

export function findAccount(accountId: string | null | undefined): AccountProfile | null {
  if (!accountId || typeof accountId !== 'string') return null;

  const primy = availableAccounts.find(a => a.id === accountId);
  if (primy) return primy;

  const alias = ACCOUNT_ID_ALIASES[accountId.trim().toLowerCase()];
  if (alias) {
    return availableAccounts.find(a => a.id === alias) ?? null;
  }

  return null;
}

/**
 * Účet pro dané id — vždy něco vrátí. Neznámé, poškozené nebo prázdné id
 * není důvod k chybové hlášce, uživatel dostane výchozí profil.
 */
export function resolveAccount(accountId: string | null | undefined): AccountProfile {
  return findAccount(accountId) ?? defaultAccount;
}
