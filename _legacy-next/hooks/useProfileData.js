/**
 * useProfileData – unified profile data orchestration.
 *
 * Replaces fragile skip/refetch logic with explicit invalidation:
 * - After mutations (workout, preferences, weight, settings): refetch always applies fresh server data.
 * - Background refresh (interval, visibility): same policy – server is source of truth.
 *
 * No lastMutatedAtRef, no skip-on-just-mutated, no data-loss heuristics.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchProfile } from '../lib/profileApi';

/** When plan is processing (e.g. after registration), poll until plan appears or timeout */
const PLAN_PROCESSING_POLL_MS = 3000;
const PLAN_PROCESSING_POLL_MAX = 40; // 40 × 3s = 2 min

/** Initial load timeout (15 s) */
const INITIAL_LOAD_TIMEOUT_MS = 15000;

const AUTH_ERRORS = ['Neplatná session', 'Nejste přihlášen'];

/**
 * @param {Object} options
 * @param {string|null} options.accessToken - Supabase access token
 * @param {boolean} options.enabled - Whether to run initial fetch and background refresh
 * @param {Function} [options.refreshSession] - async () => session. Used for interval/visibility and auth retry.
 * @param {Function} [options.onSessionRefreshed] - (session) => void. Called when session is refreshed after retry.
 * @param {Function} [options.onAuthFailure] - async () => void. Called when auth retry fails (signOut, redirect).
 * @returns {{
 *   profile: Object|null,
 *   setProfile: Function,
 *   loading: boolean,
 *   error: string,
 *   refetch: (token?: string) => Promise<{ ok: boolean, profile?: Object, error?: string }>,
 *   profileRef: { current: Object|null }
 * }}
 */
export function useProfileData({
  accessToken,
  enabled = true,
  refreshSession,
  onSessionRefreshed,
  onAuthFailure,
}) {
  const [profile, setProfileState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const profileRef = useRef(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const refetch = useCallback(
    async (token) => {
      const t = token ?? accessToken;
      if (!t) return { ok: false, error: 'No token' };

      const result = await fetchProfile(t);
      if (result.error) {
        setError(result.error);
        return result;
      }
      if (result.profile) {
        setProfileState(result.profile);
        setError('');
      }
      return result;
    },
    [accessToken]
  );

  // Initial load – no skip logic, always apply server data
  useEffect(() => {
    if (!enabled || !accessToken) {
      if (!enabled) setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setError('Načítání trvalo příliš dlouho. Zkontroluj připojení a obnov stránku.');
      }
    }, INITIAL_LOAD_TIMEOUT_MS);

    (async () => {
      let result = await refetch(accessToken);
      if (cancelled) return;

      if (result?.error && AUTH_ERRORS.includes(result.error) && refreshSession) {
        const retrySession = await refreshSession();
        if (retrySession?.access_token) {
          result = await refetch(retrySession.access_token);
          if (result?.ok && onSessionRefreshed) onSessionRefreshed(retrySession);
        }
        if (cancelled) return;
        if (result?.error && onAuthFailure) {
          await onAuthFailure();
          return;
        }
      }
    })()
      .catch(() => {
        if (!cancelled) setError('Nepodařilo se načíst profil.');
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [accessToken, enabled]);

  // Žádné automatické obnovování – uživatel obnoví ručně tlačítkem „Obnovit“

  // When plan is processing (e.g. right after registration), poll so plan appears as soon as ready
  useEffect(() => {
    const planState = profile?._diagnostics?.plan_state;
    if (planState !== 'processing' || !accessToken || !enabled) return;
    let count = 0;
    const early = setTimeout(() => {
      refetch(accessToken).catch(() => {});
    }, 2000);
    const id = setInterval(async () => {
      count += 1;
      if (count > PLAN_PROCESSING_POLL_MAX) {
        clearInterval(id);
        return;
      }
      try {
        const result = await refetch(accessToken);
        if (result?.profile?._diagnostics?.plan_state !== 'processing') clearInterval(id);
      } catch (_) {}
    }, PLAN_PROCESSING_POLL_MS);
    return () => {
      clearTimeout(early);
      clearInterval(id);
    };
  }, [accessToken, enabled, profile?._diagnostics?.plan_state, refetch]);

  const setProfile = useCallback((updater) => {
    setProfileState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  return {
    profile,
    setProfile,
    loading,
    error,
    refetch,
    profileRef,
  };
}
