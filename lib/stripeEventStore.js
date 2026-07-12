/**
 * Idempotence Stripe webhook událostí (stripe_events).
 */
import { supabaseServer } from './supabaseServer';

const STALE_PROCESSING_MS = 5 * 60 * 1000;

function isMissingTableError(error) {
  return error?.code === '42P01' || /does not exist/i.test(error?.message || '');
}

/**
 * @param {import('stripe').Stripe.Event} event
 * @returns {Promise<'proceed'|'duplicate'|'no_table'>}
 */
export async function claimStripeEvent(event) {
  const eventId = event.id;
  const eventType = event.type;
  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await supabaseServer
    .from('stripe_events')
    .select('id, status, processing_started_at, handler_result')
    .eq('stripe_event_id', eventId)
    .maybeSingle();

  if (selErr) {
    if (isMissingTableError(selErr)) return 'no_table';
    console.error('[stripeEventStore] lookup failed:', selErr.message);
    return 'proceed';
  }

  if (existing) {
    const status = String(existing.status || 'completed');
    if (status === 'completed' || (existing.handler_result && status !== 'failed' && status !== 'processing')) {
      return 'duplicate';
    }
    if (status === 'processing') {
      const started = existing.processing_started_at ? new Date(existing.processing_started_at).getTime() : 0;
      if (started && Date.now() - started < STALE_PROCESSING_MS) {
        return 'duplicate';
      }
    }
    const { error: updErr } = await supabaseServer
      .from('stripe_events')
      .update({
        status: 'processing',
        processing_started_at: now,
        handler_result: null,
        error_message: null,
        processed_at: now,
      })
      .eq('stripe_event_id', eventId);
    if (updErr && !isMissingTableError(updErr)) {
      console.error('[stripeEventStore] retry claim failed:', updErr.message);
    }
    return 'proceed';
  }

  const { error: insErr } = await supabaseServer.from('stripe_events').insert({
    stripe_event_id: eventId,
    event_type: eventType,
    status: 'processing',
    processing_started_at: now,
    handler_result: null,
  });

  if (insErr) {
    if (insErr.code === '23505') return 'duplicate';
    if (isMissingTableError(insErr)) return 'no_table';
    console.error('[stripeEventStore] insert claim failed:', insErr.message);
  }

  return 'proceed';
}

/**
 * @param {string} eventId
 * @param {string} result
 */
export async function completeStripeEvent(eventId, result) {
  const { error } = await supabaseServer
    .from('stripe_events')
    .update({
      status: 'completed',
      handler_result: result,
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('stripe_event_id', eventId);
  if (error && !isMissingTableError(error)) {
    console.error('[stripeEventStore] complete failed:', error.message);
  }
}

/**
 * @param {string} eventId
 * @param {string} result
 * @param {string} [errorMessage]
 */
export async function failStripeEvent(eventId, result, errorMessage = null) {
  const { error } = await supabaseServer
    .from('stripe_events')
    .update({
      status: 'failed',
      handler_result: result,
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
      processed_at: new Date().toISOString(),
    })
    .eq('stripe_event_id', eventId);
  if (error && !isMissingTableError(error)) {
    console.error('[stripeEventStore] fail mark failed:', error.message);
  }
}

/**
 * @param {string} eventId
 * @param {string} result
 */
export async function skipStripeEvent(eventId, result) {
  await completeStripeEvent(eventId, result);
}
