// /pages/plan/[id].js
// Public web view of a weekly plan. Linked from emails as "View in browser".
// Access control: plan_id is a UUID v4 (~122 bits of entropy) so direct fetch
// by ID is safe — only the email recipient knows the URL. No login required.

import { supabaseServer } from '../../lib/supabaseServer';
import { getPublicAppUrl } from '../../lib/siteUrls.js';
import PlanWebView from '../../components/PlanWebView';
import { readFileSync } from 'fs';
import { join } from 'path';

function isValidUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function loadCoachVoice() {
  try {
    const path = join(process.cwd(), 'lib', 'templates', 'v5_content', 'coach_voice_v5_cs.json');
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export async function getServerSideProps(context) {
  const { id } = context.params || {};
  if (!isValidUuid(id)) {
    return { notFound: true };
  }

  const { data: plan, error: planErr } = await supabaseServer
    .from('ai_generated_plans')
    .select('id, structured_plan_json, user_id, valid_from, valid_until, email')
    .eq('id', id)
    .maybeSingle();

  if (planErr) {
    console.error('[plan/[id]] supabase error', { id, message: planErr.message });
    return { notFound: true };
  }
  if (!plan || !plan.structured_plan_json) {
    return { notFound: true };
  }

  let bodyMetrics = null;
  let firstName = null;
  if (plan.user_id) {
    const { data: bmRow } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', plan.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bmRow) {
      bodyMetrics = bmRow;
      firstName = bmRow.name ?? null;
    }
  }

  const coachVoice = loadCoachVoice();
  const appBaseUrl = String(getPublicAppUrl() || 'https://app.bodyandmindon.cz').replace(/\/$/, '');

  // Cache for 5 minutes at CDN, allow stale while revalidate for 60 minutes.
  context.res.setHeader(
    'Cache-Control',
    'public, max-age=0, s-maxage=300, stale-while-revalidate=3600'
  );

  return {
    props: {
      planId: plan.id,
      planJson: plan.structured_plan_json,
      bodyMetrics,
      firstName,
      validFrom: plan.valid_from ?? null,
      appBaseUrl,
      coachVoice,
    },
  };
}

export default function PlanWebPage(props) {
  return <PlanWebView {...props} />;
}
