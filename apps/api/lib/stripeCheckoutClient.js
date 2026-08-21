/**
 * Frontend helper pro autentizovaný Stripe Checkout.
 * @param {'START'|'ON_CLUB'|'VIP'} tier
 * @param {string} accessToken Supabase JWT
 * @returns {Promise<string>} checkout URL
 */
export async function createStripeCheckoutUrl(tier, accessToken) {
  const res = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ tier }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Checkout se nepodařilo spustit.');
  }
  if (!data?.url) {
    throw new Error('Stripe nevrátil checkout URL.');
  }
  return data.url;
}
