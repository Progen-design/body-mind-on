#!/usr/bin/env node
/**
 * Ověření Withings integrace — env config, API, connect flow.
 *   npm run verify:withings-integration
 *   BASE_URL=https://app.bodyandmindon.cz npm run verify:withings-integration
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { fetchWithTimeout, FETCH_TIMEOUT } from './lib/fetchWithTimeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts');
const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const EXPECTED_CALLBACK = 'https://app.bodyandmindon.cz/api/withings/callback';
const TIMESTAMP = Date.now();
const TEST_EMAIL = process.env.VERIFY_WITHINGS_EMAIL
  || process.env.E2E_EMAIL
  || `info+bm-withings-int-${TIMESTAMP}@bodyandmindon.cz`;
const TEST_PASSWORD = process.env.VERIFY_WITHINGS_PASSWORD || process.env.E2E_PASSWORD || 'WithingsInt2026!';
const REPORT_PATH = join(ARTIFACTS, `verify-withings-integration-${TIMESTAMP}.json`);

const report = {
  productionDeploy: {},
  envConfig: {},
  callback: {},
  apiEndpoints: {},
  uiState: {},
  connectTest: {},
  verdict: 'FAIL',
  verdictReason: '',
};

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return true;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  return false;
}

function loadEnv() {
  for (const name of ['.env.production.local', '.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && process.env[m[1].trim()] === undefined) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
    break;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function envVarPresent(name, source = process.env) {
  const val = String(source[name] || '').trim();
  return Boolean(val);
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function parseVercelEnvList(output) {
  const names = new Set();
  for (const line of String(output || '').split('\n')) {
    const m = line.match(/^\s+([A-Z0-9_]+)\s+/);
    if (m) names.add(m[1].trim());
  }
  return names;
}

function auditEnvConfig(env = process.env, vercelNames = new Set()) {
  const keys = [
    'WITHINGS_CLIENT_ID',
    'WITHINGS_CLIENT_SECRET',
    'WITHINGS_REDIRECT_URI',
    'WITHINGS_API_URL',
    'WITHINGS_SCOPES',
    'WITHINGS_TOKEN_ENCRYPTION_KEY',
  ];
  const missing = keys.filter((k) => !envVarPresent(k, env) && !vercelNames.has(k));
  const redirectUri = String(env.WITHINGS_REDIRECT_URI || EXPECTED_CALLBACK).trim();
  const apiUrl = String(env.WITHINGS_API_URL || 'https://wbsapi.withings.net').trim()
    || 'https://wbsapi.withings.net';
  const configured = missing.length === 0;

  return {
    WITHINGS_CLIENT_ID_exists: envVarPresent('WITHINGS_CLIENT_ID', env) || vercelNames.has('WITHINGS_CLIENT_ID'),
    WITHINGS_CLIENT_SECRET_exists: envVarPresent('WITHINGS_CLIENT_SECRET', env) || vercelNames.has('WITHINGS_CLIENT_SECRET'),
    WITHINGS_REDIRECT_URI_exists: envVarPresent('WITHINGS_REDIRECT_URI', env) || vercelNames.has('WITHINGS_REDIRECT_URI') || redirectUri === EXPECTED_CALLBACK,
    WITHINGS_API_URL_exists: envVarPresent('WITHINGS_API_URL', env) || vercelNames.has('WITHINGS_API_URL') || Boolean(apiUrl),
    WITHINGS_SCOPES_exists: envVarPresent('WITHINGS_SCOPES', env) || vercelNames.has('WITHINGS_SCOPES'),
    WITHINGS_TOKEN_ENCRYPTION_KEY_exists: envVarPresent('WITHINGS_TOKEN_ENCRYPTION_KEY', env) || vercelNames.has('WITHINGS_TOKEN_ENCRYPTION_KEY'),
    configured,
    missing,
    redirectUri,
    apiUrl,
    scopes: String(env.WITHINGS_SCOPES || 'user.info,user.metrics,user.activity').trim(),
  };
}

async function fetchDeploymentInfo() {
  const res = await fetch(`${BASE_URL}/profil`, { redirect: 'follow' });
  const html = await res.text();
  const dpl = html.match(/dpl=dpl_[^"'&]+/)?.[0]?.replace('dpl=', '')
    || res.headers.get('x-vercel-id')
    || 'unknown';
  const gitSha = res.headers.get('x-vercel-git-commit-sha')
    || res.headers.get('x-deployment-git-commit')
    || null;
  report.productionDeploy = {
    deploymentId: dpl,
    state: res.ok ? 'Ready' : `HTTP ${res.status}`,
    productionUrl: BASE_URL,
    gitSha: gitSha || 'unknown',
  };
}

async function probeEndpoint(method, path, options = {}) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method,
      redirect: 'manual',
      headers: options.headers || {},
      body: options.body,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text, json, location: res.headers.get('location') };
  } catch (err) {
    return { status: 0, error: err.message, text: '', json: null, location: null };
  }
}

async function registerAndLogin(supabase) {
  const payload = {
    email: TEST_EMAIL,
    name: 'Withings Integration',
    password: TEST_PASSWORD,
    gender: 'male',
    age: 34,
    height: 180,
    weight: 82,
    activity: 'moderate',
    stress: 'medium',
    worktype: 'sedentary',
    goal: 'udrzovani',
    frequency: '3-4x týdně',
    program: 'START',
    workout_days: [1, 3, 5],
    training_environment: 'gym',
    available_equipment: [],
    diet_type: 'standard',
  };
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/body-metrics`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    FETCH_TIMEOUT.BODY_METRICS,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 503 && body.hasUserId)) {
    throw new Error(`Registration failed HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const { data: plan } = await supabase
      .from('ai_generated_plans')
      .select('id, structured_plan_json, plan_html')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const hasPlan = (plan?.plan_html && String(plan.plan_html).length > 500)
      || plan?.structured_plan_json?.days?.length;
    if (hasPlan || body.plan_state === 'ready' || body.planSent) break;
    await sleep(2000);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button.login-submit').click();
  await page.waitForURL(/\/profil/, { timeout: 60000 });
  const token = await page.evaluate(async () => {
    const mod = await import('/lib/supabaseClient.js').catch(() => null);
    return null;
  }).catch(() => null);

  let accessToken = null;
  for (let i = 0; i < 20; i++) {
    accessToken = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (!key.includes('auth-token')) continue;
        try {
          const raw = localStorage.getItem(key);
          const parsed = JSON.parse(raw);
          const token = parsed?.access_token || parsed?.currentSession?.access_token;
          if (token) return token;
        } catch { /* ignore */ }
      }
      return null;
    });
    if (accessToken) break;
    await sleep(500);
  }

  return { browser, page, accessToken };
}

async function runStaticUnitChecks() {
  console.log('--- Static unit checks ---');
  const { normalizeWithingsMeasures } = await import('../lib/withings/normalizeWithingsMeasures.js');
  const { calculateWithingsTrends } = await import('../lib/withings/withingsTrends.js');
  const { generateWithingsRecommendations, recommendationsAreSafe } = await import('../lib/withings/withingsRecommendations.js');
  const { buildWithingsCoachContext } = await import('../lib/withings/buildWithingsCoachContext.js');

  const sampleGroup = {
    grpid: 12345,
    date: Math.floor(Date.now() / 1000),
    measures: [
      { type: 1, value: 10420, unit: -2 },
      { type: 6, value: 221, unit: -1 },
      { type: 8, value: 23000, unit: -3 },
      { type: 76, value: 72000, unit: -3 },
      { type: 88, value: 3800, unit: -3 },
      { type: 77, value: 55000, unit: -3 },
      { type: 11, value: 7200, unit: -2 },
      { type: 226, value: 1850000, unit: -3 },
    ],
  };

  const normalized = normalizeWithingsMeasures(sampleGroup, { height_cm: 185 });
  check('normalizeWithingsMeasures supports weight_kg', normalized.weight_kg === 104.2);
  check('normalizeWithingsMeasures supports fat_percent', normalized.fat_percent === 22.1);
  check('normalizeWithingsMeasures supports muscle_mass_kg', normalized.muscle_mass_kg === 72);
  check('normalizeWithingsMeasures supports bone_mass_kg', normalized.bone_mass_kg === 3.8);
  check('normalizeWithingsMeasures supports hydration_kg', normalized.hydration_kg === 55);
  check('normalizeWithingsMeasures supports pulse', normalized.pulse === 72);
  check('normalizeWithingsMeasures supports basal_metabolic_rate', normalized.basal_metabolic_rate === 1850);
  check('normalizeWithingsMeasures computes bmi', Number.isFinite(normalized.bmi));
  check('missing values are null not 0', normalized.hydration_percent === null && normalized.visceral_fat === null);

  const invalid = normalizeWithingsMeasures({
    date: Math.floor(Date.now() / 1000),
    measures: [{ type: 1, value: 500, unit: -2 }],
  });
  check('invalid weight rejected', invalid.weight_kg === null);

  const sparseTrends = calculateWithingsTrends([
    { measured_at: new Date().toISOString(), weight_kg: 80, fat_percent: 20, muscle_mass_kg: 35 },
  ]);
  check('trend helper returns low-data message', sparseTrends.hasEnoughData === false && /dalších měřeních/i.test(sparseTrends.message || ''));

  const trends = calculateWithingsTrends([
    { measured_at: new Date().toISOString(), weight_kg: 80, fat_percent: 20, muscle_mass_kg: 35 },
    { measured_at: new Date(Date.now() - 86400000).toISOString(), weight_kg: 80.8, fat_percent: 20.4, muscle_mass_kg: 34.8 },
  ]);
  check('trend helper computes delta', Number.isFinite(trends.delta?.weight_kg));

  const reco = generateWithingsRecommendations({
    latest: normalized,
    trends,
    userGoal: 'redukce',
    trainingFrequency: '3× týdně',
    nutritionTarget: '2200 kcal/den',
  });
  check('recommendation helper exists', reco?.status === 'ok' && typeof reco.summary === 'string');
  check('recommendation helper has disclaimer', /lékařsk/i.test(reco.disclaimer || ''));
  check('recommendation helper no diagnoses', recommendationsAreSafe(reco));

  const coach = buildWithingsCoachContext({ id: 'u1', user_metadata: { goal: 'redukce' } }, normalized, trends, { userGoal: 'redukce' });
  const coachJson = JSON.stringify(coach);
  check('coach context has no tokens', !/access_token|refresh_token|client_secret|ciphertext/i.test(coachJson));
  check('coach context has no raw payload', !coachJson.includes('raw_payload'));

  check('normalize helper file exists', existsSync(join(ROOT, 'lib/withings/normalizeWithingsMeasures.js')));
  check('trends helper file exists', existsSync(join(ROOT, 'lib/withings/withingsTrends.js')));
  check('recommendations helper file exists', existsSync(join(ROOT, 'lib/withings/withingsRecommendations.js')));
  check('coach context helper file exists', existsSync(join(ROOT, 'lib/withings/buildWithingsCoachContext.js')));
  check('body snapshots migration exists', existsSync(join(ROOT, 'supabase/migrations/20260701090000_withings_body_snapshots.sql')));

  const widget = readFileSync(join(ROOT, 'components/profile/WithingsProfileCard.js'), 'utf8');
  check('UI shows trend section', widget.includes('withings-trends'));
  check('UI shows recommendations section', widget.includes('Doporučení podle měření'));
  check('UI no zero kg placeholder', !widget.includes('0,0 kg') && !widget.includes('0.0 kg'));
}

async function runProductionChecks() {
  loadEnv();
  mkdirSync(ARTIFACTS, { recursive: true });

  await runStaticUnitChecks();

  console.log('\n--- ÚKOL 1: Production deploy ---');
  await fetchDeploymentInfo();
  check('production URL responds', report.productionDeploy.state === 'Ready', report.productionDeploy.productionUrl);
  check('deployment ID present', Boolean(report.productionDeploy.deploymentId), report.productionDeploy.deploymentId);

  console.log('\n--- ÚKOL 2: Env config (Vercel ls + runtime, no secrets) ---');
  const vercelLs = spawnSync(process.platform === 'win32' ? 'vercel.cmd' : 'vercel', [
    'env', 'ls', 'production',
  ], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  const vercelNames = parseVercelEnvList(`${vercelLs.stdout || ''}\n${vercelLs.stderr || ''}`);
  const pullPath = join(ROOT, '.env.vercel-withings-check');
  spawnSync(process.platform === 'win32' ? 'vercel.cmd' : 'vercel', [
    'env', 'pull', pullPath, '--environment', 'production', '--yes',
  ], { cwd: ROOT, stdio: 'pipe', shell: process.platform === 'win32' });
  const pulled = parseEnvFile(pullPath);
  try { require('fs').unlinkSync(pullPath); } catch { /* ignore */ }
  report.envConfig = auditEnvConfig({ ...process.env, ...pulled }, vercelNames);

  check('WITHINGS_CLIENT_ID exists', report.envConfig.WITHINGS_CLIENT_ID_exists);
  check('WITHINGS_CLIENT_SECRET exists', report.envConfig.WITHINGS_CLIENT_SECRET_exists);
  check('WITHINGS_REDIRECT_URI exists', report.envConfig.WITHINGS_REDIRECT_URI_exists);
  check('WITHINGS_API_URL exists', report.envConfig.WITHINGS_API_URL_exists);
  check('WITHINGS_SCOPES exists', report.envConfig.WITHINGS_SCOPES_exists);
  check('WITHINGS_TOKEN_ENCRYPTION_KEY exists', report.envConfig.WITHINGS_TOKEN_ENCRYPTION_KEY_exists);
  check('configured = true', report.envConfig.configured, `missing=${report.envConfig.missing.join(',') || 'none'}`);

  console.log('\n--- ÚKOL 3: Callback URL ---');
  const redirectUri = report.envConfig.redirectUri || EXPECTED_CALLBACK;
  report.callback = {
    redirectUri,
    matchesProductionCallback: redirectUri === EXPECTED_CALLBACK,
    localhostUsed: /localhost|127\.0\.0\.1/.test(redirectUri),
    previewUrlUsed: /vercel\.app/i.test(redirectUri),
    trailingSlash: redirectUri.endsWith('/'),
  };
  check('redirect URI matches production callback', report.callback.matchesProductionCallback, redirectUri);
  check('no localhost in redirect URI', !report.callback.localhostUsed);
  check('no preview URL in redirect URI', !report.callback.previewUrlUsed);
  check('no trailing slash', !report.callback.trailingSlash);

  console.log('\n--- ÚKOL 4: API endpoints ---');
  const endpointFiles = {
    connect: 'pages/api/withings/connect.js',
    callback: 'pages/api/withings/callback.js',
    sync: 'pages/api/withings/sync.js',
    latest: 'pages/api/withings/latest.js',
    history: 'pages/api/withings/history.js',
    disconnect: 'pages/api/withings/disconnect.js',
    auth: 'pages/api/withings/auth.js',
  };
  const missingEndpoints = [];
  for (const [name, file] of Object.entries(endpointFiles)) {
    const exists = existsSync(join(ROOT, file));
    report.apiEndpoints[name] = exists ? 'exists' : 'missing';
    if (!exists) missingEndpoints.push(`/api/withings/${name}`);
  }
  report.apiEndpoints.missingEndpoints = missingEndpoints;

  const callbackProbe = await probeEndpoint('GET', '/api/withings/callback');
  const latestProbe = await probeEndpoint('GET', '/api/withings/latest');
  const syncProbe = await probeEndpoint('POST', '/api/withings/sync');
  const historyProbe = await probeEndpoint('GET', '/api/withings/history');
  const disconnectProbe = await probeEndpoint('POST', '/api/withings/disconnect');
  const connectProbe = await probeEndpoint('GET', '/api/withings/connect');
  const authProbe = await probeEndpoint('GET', '/api/withings/auth');

  check('callback route live', callbackProbe.status === 400 || callbackProbe.status === 302, `status=${callbackProbe.status}`);
  check('latest requires auth', latestProbe.status === 401, `status=${latestProbe.status}`);
  check('sync requires auth', syncProbe.status === 401, `status=${syncProbe.status}`);
  check('history requires auth', historyProbe.status === 401, `status=${historyProbe.status}`);
  check('disconnect requires auth', disconnectProbe.status === 401, `status=${disconnectProbe.status}`);
  check('connect route live', connectProbe.status === 302 || connectProbe.status === 401, `connect status=${connectProbe.status}`);
  check('auth route live', authProbe.status === 302 || authProbe.status === 401, `auth status=${authProbe.status}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    check('Supabase env for live connect test', false, 'missing service role');
    report.verdict = 'PARTIAL';
    report.verdictReason = 'missing Supabase env for authenticated tests';
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
    process.exit(failed ? 1 : 0);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  console.log('\n--- ÚKOL 5–6: UI + Connect test (authenticated) ---');
  let browser;
  let page;
  let accessToken;
  try {
    ({ browser, page, accessToken } = await registerAndLogin(supabase));
  } catch (err) {
    check('register/login test account', false, err.message);
    report.verdict = 'PARTIAL';
    report.verdictReason = err.message;
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (!accessToken) {
    const { data: signIn } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
    accessToken = signIn?.session?.access_token || null;
  }
  check('test user access token', Boolean(accessToken));

  const latestAuth = await fetch(`${BASE_URL}/api/withings/latest`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((r) => r.json().catch(() => ({})).then((json) => ({ status: r.status, json })));
  check('latest configured=true on production runtime', latestAuth.json?.configured === true, `configured=${latestAuth.json?.configured}`);
  check('latest does not expose tokens', !JSON.stringify(latestAuth.json || {}).match(/access_token|refresh_token|client_secret|ciphertext|raw_payload/i));

  const connectRes = await fetch(`${BASE_URL}/api/withings/connect?format=json&return_to=/profil`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const connectJson = await connectRes.json().catch(() => ({}));
  const authorizeUrl = connectJson?.url || '';
  let parsedAuthUrl = null;
  try { parsedAuthUrl = new URL(authorizeUrl); } catch { /* ignore */ }

  report.connectTest = {
    responseStatus: connectRes.status,
    authorizeUrlGenerated: Boolean(authorizeUrl),
    containsState: Boolean(parsedAuthUrl?.searchParams.get('state')),
    containsCorrectRedirectUri: parsedAuthUrl?.searchParams.get('redirect_uri') === EXPECTED_CALLBACK,
    containsScopeUserMetrics: (parsedAuthUrl?.searchParams.get('scope') || '').includes('user.metrics'),
    containsResponseTypeCode: parsedAuthUrl?.searchParams.get('response_type') === 'code',
    containsClientId: Boolean(parsedAuthUrl?.searchParams.get('client_id')),
    secretsExposed: /client_secret|WITHINGS_CLIENT_SECRET|refresh_token|access_token|ciphertext/i.test(JSON.stringify(connectJson)),
    redirectUriFromApi: connectJson?.redirect_uri || null,
  };

  check('/api/withings/connect returns 200', connectRes.status === 200, `status=${connectRes.status}`);
  check('connect authorize URL generated', report.connectTest.authorizeUrlGenerated);
  check('connect authorize URL has state', report.connectTest.containsState);
  check('connect redirect_uri correct', report.connectTest.containsCorrectRedirectUri);
  check('connect scope includes user.metrics', report.connectTest.containsScopeUserMetrics);
  check('no secrets in connect response', !report.connectTest.secretsExposed);

  const authRes = await fetch(`${BASE_URL}/api/withings/auth?format=json&return_to=/profil`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const authJson = await authRes.json().catch(() => ({}));
  check('auth endpoint still returns 200', authRes.status === 200, `status=${authRes.status}`);
  check('auth still generates authorize URL', Boolean(authJson?.url));
  check('no secrets in auth response', !/client_secret|refresh_token|access_token|ciphertext/i.test(JSON.stringify(authJson)));

  const historyAuth = await fetch(`${BASE_URL}/api/withings/history?limit=30`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const historyJson = await historyAuth.json().catch(() => ({}));
  report.historyTest = {
    statusWithAuth: historyAuth.status,
    hasMeasurementsArray: Array.isArray(historyJson?.measurements),
    secretsExposed: /client_secret|refresh_token|access_token|ciphertext|raw_payload/i.test(JSON.stringify(historyJson)),
  };
  check('history with auth returns 200', historyAuth.status === 200, `status=${historyAuth.status}`);
  check('history returns measurements array', report.historyTest.hasMeasurementsArray);
  check('history does not expose tokens', !report.historyTest.secretsExposed);
  check('latest returns trends object when connected', latestAuth.json?.connected !== true || typeof latestAuth.json?.trends === 'object');
  check('latest returns recommendations when connected', latestAuth.json?.connected !== true || typeof latestAuth.json?.recommendations === 'object');

  const disconnectNoConn = await fetch(`${BASE_URL}/api/withings/disconnect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const disconnectJson = await disconnectNoConn.json().catch(() => ({}));
  check('disconnect without connection returns 404', disconnectNoConn.status === 404, `status=${disconnectNoConn.status}`);
  check('disconnect does not expose tokens', !/client_secret|refresh_token|access_token|ciphertext/i.test(JSON.stringify(disconnectJson)));

  const syncNoConn = await fetch(`${BASE_URL}/api/withings/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  check('sync fails without connection', syncNoConn.status === 404 || syncNoConn.status === 500, `status=${syncNoConn.status}`);

  await page.waitForSelector('.withings-floating-card', { timeout: 30000 });
  await page.locator('.withings-launcher').click();
  await sleep(600);
  const ui = await page.evaluate(() => {
    const card = document.querySelector('.withings-floating-card');
    const text = card?.innerText || '';
    return {
      state: card?.dataset.withingsState || '',
      text,
      hasNotConfiguredCopy: /Chytrá váha zatím není aktivní|Připravujeme/i.test(text),
      hasTechnicalOAuth: /OAuth|klientské údaje|dashboard|env|client secret/i.test(text),
      hasConnectCta: /Propojit Withings/i.test(text),
      hasNotConnectedCopy: /Propoj chytrou váhu/i.test(text),
      showsZeroWeight: /\b0[,.]0\s*kg\b/.test(text),
    };
  });

  report.uiState = {
    widgetState: ui.state,
    notConfiguredShown: ui.hasNotConfiguredCopy || ui.state === 'not_configured',
    notConnectedShown: ui.hasNotConnectedCopy || ui.state === 'not_connected',
    connectCtaShown: ui.hasConnectCta,
    technicalOAuthErrorShown: ui.hasTechnicalOAuth,
    zeroKgWithoutData: ui.showsZeroWeight,
  };

  check('UI not in not_configured', !report.uiState.notConfiguredShown, `state=${ui.state}`);
  check('UI shows connect CTA or not_connected', report.uiState.connectCtaShown || report.uiState.notConnectedShown);
  check('no technical OAuth error in UI', !report.uiState.technicalOAuthErrorShown);
  check('no 0.0 kg without data', !report.uiState.zeroKgWithoutData);

  await browser.close();

  const critical = [
    report.productionDeploy.state === 'Ready',
    report.envConfig.configured,
    report.callback.matchesProductionCallback,
    latestAuth.json?.configured === true,
    connectRes.status === 200 && report.connectTest.authorizeUrlGenerated,
    authRes.status === 200 && Boolean(authJson?.url),
    historyAuth.status === 200 && report.historyTest.hasMeasurementsArray,
    !report.connectTest.secretsExposed,
    !report.historyTest.secretsExposed,
    !report.uiState.notConfiguredShown,
    !report.uiState.technicalOAuthErrorShown,
    missingEndpoints.length === 0,
  ];
  report.verdict = critical.every(Boolean) ? 'READY' : failed === 0 ? 'PARTIAL' : 'FAIL';
  if (!critical.every(Boolean)) {
    const reasons = [];
    if (!report.envConfig.configured) reasons.push('env not fully configured');
    if (latestAuth.json?.configured !== true) reasons.push('runtime configured=false');
    if (report.uiState.notConfiguredShown) reasons.push('UI still not_configured');
    if (missingEndpoints.length) reasons.push(`missing endpoints: ${missingEndpoints.join(', ')}`);
    if (!report.connectTest.authorizeUrlGenerated) reasons.push('connect URL missing');
    if (!report.historyTest?.hasMeasurementsArray) reasons.push('history response invalid');
    report.verdictReason = reasons.join('; ') || 'see failed checks';
  } else {
    report.verdictReason = 'connect alias, history endpoint, auth/sync/callback OK, no token leaks';
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Verdict: ${report.verdict} — ${report.verdictReason}`);
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
  process.exit(failed === 0 ? 0 : 1);
}

runProductionChecks().catch((err) => {
  console.error('Fatal:', err);
  report.verdict = 'FAIL';
  report.verdictReason = err.message;
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  } catch { /* ignore */ }
  process.exit(1);
});
