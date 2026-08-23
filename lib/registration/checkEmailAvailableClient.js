/**
 * Client helper for registration step 1 email check.
 * @param {string} email
 * @returns {Promise<{ available: boolean, rateLimited?: boolean, networkError?: boolean }>}
 */
export async function fetchRegistrationEmailAvailable(email) {
  try {
    const res = await fetch('/api/registration/email-available', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim() }),
    });
    if (res.status === 429) {
      return { available: false, rateLimited: true };
    }
    // Nedostupny nebo nesrozumitelny endpoint NENI obsazeny e-mail. Driv se
    // obojí slilo do available:false a uzivateli se pri vypadku API tvrdilo,
    // ze ucet uz existuje — registrace se pro nej zavrela uplne. Autoritativni
    // kontrola stejne probehne na serveru pri odeslani.
    if (!res.ok) {
      return { available: false, networkError: true };
    }
    const json = await res.json().catch(() => null);
    if (!json || typeof json.available !== 'boolean') {
      return { available: false, networkError: true };
    }
    return { available: json.available === true };
  } catch {
    return { available: false, networkError: true };
  }
}

export const EMAIL_TAKEN_MESSAGE_CS =
  'Tento e-mail už je registrovaný. Přihlas se.';

export const EMAIL_CHECK_FAILED_MESSAGE_CS =
  'E-mail se nepodařilo ověřit. Zkus to prosím znovu.';
