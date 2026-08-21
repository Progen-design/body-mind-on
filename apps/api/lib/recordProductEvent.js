/**
 * Server-side product event insert — never throws to caller.
 */
import { supabaseServer } from './supabaseServer';
import { isAllowedProductEvent } from './productEventAllowlist';
import { validateEventProperties, jsonByteLength } from './productEventPiiGuard';
import { enrichEventProperties } from './betaEventEnrichment';

/**
 * @param {object} row
 * @returns {Promise<boolean>}
 */
export async function recordProductEvent(row) {
  try {
    const eventName = String(row?.event_name || '').trim();
    if (!isAllowedProductEvent(eventName)) return false;

    const rawProps = row?.properties && typeof row.properties === 'object' ? row.properties : {};
    const properties = await enrichEventProperties(row.user_id || null, rawProps);
    const guard = validateEventProperties(properties);
    if (!guard.ok) return false;
    if (jsonByteLength(properties) > 5 * 1024) return false;

    const userId = row.user_id || null;

    if (userId) {
      const { data, error } = await supabaseServer.rpc('insert_product_event_server', {
        p_user_id: String(userId),
        p_event_name: eventName,
        p_properties: properties,
      });
      return !error && !!data;
    }

    const payload = {
      anonymous_id: row.anonymous_id || null,
      session_id: row.session_id || null,
      event_name: eventName,
      event_version: Number(row.event_version) || 1,
      properties,
      page_path: row.page_path ? String(row.page_path).slice(0, 200) : null,
      source: row.source ? String(row.source).slice(0, 100) : null,
      utm_source: row.utm_source ? String(row.utm_source).slice(0, 150) : null,
      utm_medium: row.utm_medium ? String(row.utm_medium).slice(0, 150) : null,
      utm_campaign: row.utm_campaign ? String(row.utm_campaign).slice(0, 150) : null,
    };

    const { error } = await supabaseServer.from('product_events').insert(payload);
    return !error;
  } catch {
    return false;
  }
}
