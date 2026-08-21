import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@lib/supabaseClient.js';
import { AccountProfile } from '../types';

interface AuthContextValue {
  /** Prihlaseny ucet, nebo null kdyz je uzivatel odhlaseny. */
  account: AccountProfile | null;
  isAuthenticated: boolean;
  /** Nez se overi session, nesmime uzivatele poslat na prihlaseni. */
  isLoading: boolean;
  loggedInAt: string | null;
  /** Klic pro localStorage - vazany na skutecne user.id, ne na demo ucet. */
  scope: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Session -> profil pro UI. Jmeno bere z metadat uctu, jinak z e-mailu. */
function naUcet(session: Session | null): AccountProfile | null {
  const u = session?.user;
  if (!u) return null;
  const meta = (u.user_metadata || {}) as Record<string, unknown>;
  const jmeno = (meta.name || meta.full_name || '') as string;
  const email = u.email || '';
  return {
    id: u.id,
    name: jmeno || email.split('@')[0] || 'Můj profil',
    email,
    role: (meta.program as string) || 'Člen',
    avatarUrl: (meta.avatar_url as string) || '',
    membershipPlan: (meta.membership_plan as string) || ''
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let zive = true;

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!zive) return;
      setSession(data?.session ?? null);
      setIsLoading(false);
    });

    // Obnova tokenu, prihlaseni na jine zalozce i odhlaseni chodi sem.
    const { data } = supabase.auth.onAuthStateChange((_udalost: string, nova: Session | null) => {
      if (!zive) return;
      setSession(nova);
      setIsLoading(false);
    });

    return () => {
      zive = false;
      data?.subscription?.unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      return { error: 'Přihlášení není nakonfigurované. Napiš nám na info@bodyandmindon.cz.' };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    if (!error) return { error: null };
    const zprava = String(error.message || '');
    if (/invalid login credentials/i.test(zprava)) {
      return { error: 'Nesprávný e-mail nebo heslo.' };
    }
    if (/email not confirmed/i.test(zprava)) {
      return { error: 'E-mail zatím není potvrzený. Zkontroluj schránku včetně spamu.' };
    }
    return { error: zprava || 'Přihlášení se nepodařilo.' };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!isSupabaseConfigured()) {
      return { error: 'Obnova hesla není nakonfigurovaná.' };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/login`
    });
    return { error: error ? String(error.message) : null };
  }, []);

  /**
   * Odhlaseni maze session, ne namerena data. Klice v localStorage jsou vazane
   * na user.id, takze po navratu uzivatel najde svoje veci tak, jak je nechal.
   */
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const account = useMemo(() => naUcet(session), [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      account,
      isAuthenticated: account !== null,
      isLoading,
      loggedInAt: session?.user?.last_sign_in_at ?? null,
      scope: session?.user?.id ?? null,
      signIn,
      resetPassword,
      logout
    }),
    [account, isLoading, session, signIn, resetPassword, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth musí být použit uvnitř <AuthProvider>.');
  return ctx;
}

/** Token do Authorization hlavicky pro volani /api/*. */
export async function ziskejPristupovyToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}
