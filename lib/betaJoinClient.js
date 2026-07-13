/**
 * Client helper — direct beta join after login/registration.
 */
const JOIN_PENDING_KEY = 'beta_join_pending';

export function setBetaJoinPending() {
  try {
    sessionStorage.setItem(JOIN_PENDING_KEY, 'true');
  } catch {
    /* ignore */
  }
}

export function clearBetaJoinPending() {
  try {
    sessionStorage.removeItem(JOIN_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function hasBetaJoinPending() {
  try {
    return sessionStorage.getItem(JOIN_PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * @param {string} accessToken
 * @param {string} [termsVersion]
 * @returns {Promise<{ok: boolean, status?: number, cohort_code?: string, error?: string}>}
 */
export async function joinBetaCohort(accessToken, termsVersion = '2026-07-cohort-1') {
  if (!accessToken) return { ok: false };

  try {
    const res = await fetch('/api/beta/join', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        beta_terms_accepted: true,
        beta_terms_version: termsVersion,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      clearBetaJoinPending();
      return { ok: true, status: res.status, cohort_code: json.cohort_code };
    }
    return {
      ok: false,
      status: res.status,
      error: json.error || 'join_failed',
    };
  } catch {
    return { ok: false };
  }
}
