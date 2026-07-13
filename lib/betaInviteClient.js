/**
 * Client helper — claim pending beta invite from sessionStorage after login/registration.
 */
const STORAGE_KEY = 'beta_pending_invite';
const TERMS_KEY = 'beta_terms_accepted';

export function storePendingBetaInvite(inviteCode) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(inviteCode || '').trim().toUpperCase());
    sessionStorage.setItem(TERMS_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearPendingBetaInvite() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(TERMS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} accessToken
 * @param {string} [termsVersion]
 * @returns {Promise<{ok: boolean, cohort_code?: string}>}
 */
export async function claimPendingBetaInvite(accessToken, termsVersion = '2026-07-cohort-1') {
  try {
    const code = sessionStorage.getItem(STORAGE_KEY);
    const terms = sessionStorage.getItem(TERMS_KEY);
    if (!code || !terms || !accessToken) return { ok: false };

    const res = await fetch('/api/beta/claim-invite', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invite_code: code,
        beta_terms_accepted: true,
        beta_terms_version: termsVersion,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      clearPendingBetaInvite();
      return { ok: true, cohort_code: json.cohort_code };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
