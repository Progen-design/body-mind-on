import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { AccountProfile, AuthSession } from '../types';
import { availableAccounts, defaultAccountId } from '../data/accounts';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface AuthContextValue {
  /** Přihlášený účet, nebo null když je uživatel odhlášený. */
  account: AccountProfile | null;
  isAuthenticated: boolean;
  /** Kdy se uživatel přihlásil (ISO řetězec). */
  loggedInAt: string | null;
  accounts: AccountProfile[];
  login: (accountId?: string) => void;
  logout: () => void;
  switchAccount: (accountId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'auth-session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useLocalStorage<AuthSession | null>(SESSION_KEY, {
    accountId: defaultAccountId,
    loggedInAt: new Date().toISOString()
  });

  const account = useMemo(
    () => availableAccounts.find(a => a.id === session?.accountId) ?? null,
    [session]
  );

  const login = useCallback(
    (accountId: string = defaultAccountId) => {
      setSession({ accountId, loggedInAt: new Date().toISOString() });
    },
    [setSession]
  );

  /**
   * Odhlášení maže jen session, ne naměřená data — po opětovném přihlášení
   * uživatel najde svůj jídelníček, váhu i návyky tak, jak je nechal.
   */
  const logout = useCallback(() => {
    setSession(null);
  }, [setSession]);

  const switchAccount = useCallback(
    (accountId: string) => {
      setSession({ accountId, loggedInAt: new Date().toISOString() });
    },
    [setSession]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      account,
      isAuthenticated: account !== null,
      loggedInAt: session?.loggedInAt ?? null,
      accounts: availableAccounts,
      login,
      logout,
      switchAccount
    }),
    [account, session, login, logout, switchAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth musí být použit uvnitř <AuthProvider>.');
  }
  return ctx;
}
