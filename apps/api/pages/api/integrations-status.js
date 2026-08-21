/**
 * GET /api/integrations-status
 * Veřejně: minimální health. Detailní diagnostika jen s INTERNAL_STATUS_SECRET.
 */
import { getAIRuntimeCapabilities } from '../../lib/aiRuntimeCapabilities';
import { getPublicAppUrl } from '../../lib/siteUrls.js';
import { supabaseServer } from '../../lib/supabaseServer';

function bool(v) {
  return typeof v === 'boolean' ? v : false;
}

function hasInternalStatusAccess(req) {
  const secret = String(process.env.INTERNAL_STATUS_SECRET || '').trim();
  if (!secret) return false;
  const headerSecret = req.headers['x-internal-secret'];
  if (typeof headerSecret === 'string' && headerSecret === secret) return true;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ') && auth.slice(7).trim() === secret) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }

  const capabilities = getAIRuntimeCapabilities();
  const app_url = getPublicAppUrl();
  const supabase_url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const supabase_project_ref = supabase_url.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1] || null;

  const supabase_db = { ok: false, latency_ms: null, error: null };
  const t0 = Date.now();
  try {
    const { error } = await supabaseServer.from('ai_generated_plans').select('id').limit(1);
    supabase_db.latency_ms = Date.now() - t0;
    if (error) {
      supabase_db.error = error.message;
    } else {
      supabase_db.ok = true;
    }
  } catch (e) {
    supabase_db.latency_ms = Date.now() - t0;
    supabase_db.error = e?.message || String(e);
  }

  const db = bool(capabilities.database?.enabled);
  const ai = bool(capabilities.ai?.enabled);
  const spoon = bool(capabilities.enrichment?.spoonacular?.enabled);
  const wger = bool(capabilities.enrichment?.wger?.enabled);
  const email = bool(capabilities.delivery?.email?.enabled);
  const stripe = bool(capabilities.billing?.stripe?.enabled);
  const cron = bool(capabilities.delivery?.cron?.enabled);

  const core_plan_flow_ok = db && ai && spoon && wger && supabase_db.ok;
  const registration_email_ok = db && email && supabase_db.ok;

  const publicBody = {
    ok: true,
    ready: {
      core_plan_flow: core_plan_flow_ok,
      registration_and_plan_email: registration_email_ok,
    },
  };

  if (!hasInternalStatusAccess(req)) {
    return res.status(200).json(publicBody);
  }

  return res.status(200).json({
    ...publicBody,
    app_url,
    supabase_project_ref,
    vercel_env: process.env.VERCEL_ENV || null,
    checks: {
      supabase_env: db,
      supabase_db: supabase_db.ok,
      supabase_db_detail: supabase_db,
      openai: ai,
      spoonacular_configured: spoon,
      wger_public_api: wger,
      email_smtp: email,
      stripe,
      cron_secret: cron,
    },
    links: {
      verify_media_apis: `${app_url}/api/verify-media-apis`,
      verify_media_apis_deep: `${app_url}/api/verify-media-apis?deep=1`,
      run_scheduler: `${app_url}/api/ai/run-scheduler`,
      daily_digest_cron: `${app_url}/api/cron/daily-digest`,
    },
    hints: {
      github_actions:
        'Pro AI frontu každých 5 min nastav v GitHubu secrets APP_URL a CRON_SECRET. Viz .github/workflows/ai-scheduler.yml.',
      vercel_cron:
        'Denní digest: vercel.json crons volá /api/cron/daily-digest s CRON_SECRET z env.',
    },
    capabilities,
  });
}
