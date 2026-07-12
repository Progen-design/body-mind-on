#!/usr/bin/env node
/**
 * Read-only audit of a Vercel project via REST API.
 * Prints deployment summary, domains, and env variable NAMES only (never values).
 *
 * Env:
 *   VERCEL_API_TOKEN (required)
 *   VERCEL_TEAM_ID (optional, for team accounts)
 *   VERCEL_PROJECT_ID (optional)
 *   VERCEL_PROJECT_NAME (default: body-mind-on)
 *
 *   node scripts/vercel-audit.mjs
 */
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const API_BASE = 'https://api.vercel.com';
const DEFAULT_PROJECT_NAME = 'body-mind-on';

/** Keys that must never appear in stdout (case-insensitive). */
const FORBIDDEN_OUTPUT_KEYS = new Set([
  'value',
  'encryptedvalue',
  'decryptedvalue',
  'token',
  'secret',
  'password',
  'authorization',
]);

function loadLocalEnvFiles() {
  for (const rel of ['.env.local', '.env']) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] != null && process.env[key] !== '') continue;
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

function fail(message, hint) {
  console.error(`ERROR: ${message}`);
  if (hint) console.error(`HINT: ${hint}`);
  process.exit(1);
}

function formatTs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return '—';
  try {
    return new Date(Number(ms)).toISOString();
  } catch {
    return String(ms);
  }
}

function formatTarget(target) {
  if (target == null) return '—';
  if (Array.isArray(target)) return target.join(', ') || '—';
  return String(target);
}

/**
 * @param {string} path
 * @param {{ token: string, teamId?: string, query?: Record<string, string|number|boolean> }} opts
 */
async function vercelApi(path, { token, teamId, query = {} }) {
  const url = new URL(`${API_BASE}${path}`);
  if (teamId) url.searchParams.set('teamId', teamId);
  for (const [key, val] of Object.entries(query)) {
    if (val == null || val === '') continue;
    url.searchParams.set(key, String(val));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
  }

  if (!res.ok) {
    const msg = body?.error?.message || body?.message || res.statusText || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

/**
 * @param {unknown} obj
 * @param {string} label
 */
function assertNoSecretLeak(obj, label) {
  const json = JSON.stringify(obj).toLowerCase();
  for (const key of FORBIDDEN_OUTPUT_KEYS) {
    if (json.includes(`"${key}"`) && key === 'value') {
      // env entries may include "type":"encrypted" — only flag if a value field has content
      if (/"value"\s*:\s*"[^"]{8,}"/i.test(json)) {
        fail(`Safety check failed for ${label}: response may contain env values. Aborting.`);
      }
    }
  }
}

async function resolveProject(token, teamId, projectId, projectName) {
  const idOrName = (projectId || projectName || DEFAULT_PROJECT_NAME).trim();

  try {
    const project = await vercelApi(`/v9/projects/${encodeURIComponent(idOrName)}`, {
      token,
      teamId,
    });
    return project;
  } catch (e) {
    if (e.status === 404 && !teamId) {
      fail(
        `Project "${idOrName}" not found.`,
        'If the project is under a team, set VERCEL_TEAM_ID in .env.local and retry.'
      );
    }
    if (e.status === 403) {
      fail(
        'Vercel API returned 403 Forbidden.',
        'Check VERCEL_API_TOKEN scope and VERCEL_TEAM_ID for team-owned projects.'
      );
    }
    if (e.status === 401) {
      fail(
        'Vercel API returned 401 Unauthorized.',
        'Create a token at https://vercel.com/account/tokens and set VERCEL_API_TOKEN.'
      );
    }
    fail(`Could not load project "${idOrName}": ${e.message}`);
  }
}

async function fetchLatestProductionDeployment(token, teamId, projectId) {
  const data = await vercelApi('/v6/deployments', {
    token,
    teamId,
    query: {
      projectId,
      target: 'production',
      limit: 1,
    },
  });
  const list = Array.isArray(data?.deployments) ? data.deployments : [];
  return list[0] ?? null;
}

async function fetchProjectDomains(token, teamId, idOrName) {
  const data = await vercelApi(`/v9/projects/${encodeURIComponent(idOrName)}/domains`, {
    token,
    teamId,
    query: { limit: 100 },
  });
  return Array.isArray(data?.domains) ? data.domains : [];
}

async function fetchProjectEnvNames(token, teamId, idOrName) {
  const data = await vercelApi(`/v10/projects/${encodeURIComponent(idOrName)}/env`, {
    token,
    teamId,
    query: { decrypt: 'false' },
  });
  return Array.isArray(data?.envs) ? data.envs : Array.isArray(data) ? data : [];
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printDeployment(deployment) {
  if (!deployment) {
    console.log('No production deployment found.');
    return;
  }

  const meta = deployment.meta && typeof deployment.meta === 'object' ? deployment.meta : {};
  const gitSource = {
    githubRepo: meta.githubRepo ?? meta.githubRepoName ?? null,
    githubCommitRef: meta.githubCommitRef ?? null,
    githubCommitSha: meta.githubCommitSha ?? null,
    githubCommitMessage: meta.githubCommitMessage ?? null,
    gitlabRepo: meta.gitlabRepo ?? null,
    bitbucketRepo: meta.bitbucketRepo ?? null,
  };
  const hasGit = Object.values(gitSource).some(Boolean);

  console.log(`deployment id:  ${deployment.uid || deployment.id || '—'}`);
  console.log(`url:            ${deployment.url ? `https://${deployment.url}` : '—'}`);
  console.log(`state:          ${deployment.state ?? deployment.readyState ?? '—'}`);
  console.log(`readyState:     ${deployment.readyState ?? deployment.ready ?? '—'}`);
  console.log(`target:         ${deployment.target ?? '—'}`);
  console.log(`createdAt:      ${formatTs(deployment.created ?? deployment.createdAt)}`);
  if (hasGit) {
    console.log('git source:');
    if (gitSource.githubRepo) console.log(`  repo:    ${gitSource.githubRepo}`);
    if (gitSource.githubCommitRef) console.log(`  branch:  ${gitSource.githubCommitRef}`);
    if (gitSource.githubCommitSha) console.log(`  commit:  ${gitSource.githubCommitSha}`);
    if (gitSource.githubCommitMessage) {
      const msg = String(gitSource.githubCommitMessage).split('\n')[0].slice(0, 120);
      console.log(`  message: ${msg}`);
    }
    if (gitSource.gitlabRepo) console.log(`  gitlab:  ${gitSource.gitlabRepo}`);
    if (gitSource.bitbucketRepo) console.log(`  bitbucket: ${gitSource.bitbucketRepo}`);
  } else {
    console.log('git source:     (not available)');
  }
}

function printDomains(domains) {
  if (!domains.length) {
    console.log('No domains configured.');
    return;
  }
  for (const d of domains) {
    const name = d.name || d.domain || '—';
    const verified = d.verified === true ? 'verified' : d.verified === false ? 'unverified' : 'unknown';
    const configured = d.configured === true ? 'configured' : d.configured === false ? 'not configured' : null;
    const target = d.target ?? d.redirect ?? null;
    const parts = [name, `status=${verified}`];
    if (configured) parts.push(configured);
    if (target) parts.push(`target=${target}`);
    if (d.gitBranch) parts.push(`branch=${d.gitBranch}`);
    console.log(`- ${parts.join(' | ')}`);
  }
}

function printEnvNames(envs) {
  if (!envs.length) {
    console.log('No environment variables found.');
    return;
  }

  const rows = envs
    .map((e) => ({
      key: e.key || e.name || '—',
      target: formatTarget(e.target),
      type: e.type ?? '—',
      createdAt: formatTs(e.createdAt ?? e.created),
      updatedAt: formatTs(e.updatedAt ?? e.updated),
      id: e.id ?? null,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  for (const row of rows) {
    console.log(
      `- ${row.key} | target=${row.target} | type=${row.type} | created=${row.createdAt} | updated=${row.updatedAt}`
    );
  }
}

async function main() {
  loadLocalEnvFiles();

  const token = String(process.env.VERCEL_API_TOKEN || '').trim();
  const teamId = String(process.env.VERCEL_TEAM_ID || '').trim() || undefined;
  const projectId = String(process.env.VERCEL_PROJECT_ID || '').trim() || undefined;
  const projectName = String(process.env.VERCEL_PROJECT_NAME || DEFAULT_PROJECT_NAME).trim();

  if (!token) {
    fail(
      'VERCEL_API_TOKEN is missing.',
      'Add VERCEL_API_TOKEN to .env.local (see README.md / DEPLOY.md). Never commit the token.'
    );
  }

  console.log('Vercel project audit (read-only)');
  console.log(`project lookup: ${projectId || projectName}`);
  if (teamId) console.log(`team: ${teamId}`);
  else console.log('team: (personal account — set VERCEL_TEAM_ID if project is team-owned)');

  const project = await resolveProject(token, teamId, projectId, projectName);
  const resolvedId = project.id || projectId;
  const resolvedName = project.name || projectName;

  printSection('Project');
  console.log(`id:   ${resolvedId || '—'}`);
  console.log(`name: ${resolvedName || '—'}`);
  if (project.accountId) console.log(`accountId: ${project.accountId}`);
  if (project.framework) console.log(`framework: ${project.framework}`);

  const deployment = await fetchLatestProductionDeployment(token, teamId, resolvedId);
  printSection('Latest production deployment');
  printDeployment(deployment);

  const domains = await fetchProjectDomains(token, teamId, resolvedId || resolvedName);
  printSection('Domains');
  printDomains(domains);

  const envs = await fetchProjectEnvNames(token, teamId, resolvedId || resolvedName);
  const safeEnvSummary = envs.map((e) => ({
    key: e.key,
    target: e.target,
    type: e.type,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    id: e.id,
  }));
  assertNoSecretLeak(safeEnvSummary, 'environment variables');
  printSection('Environment variables (names only)');
  printEnvNames(envs);

  console.log('\nAudit complete. No secret values were printed.');
}

main().catch((e) => {
  fail(e.message || String(e));
});
