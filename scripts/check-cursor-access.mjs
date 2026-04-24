#!/usr/bin/env node
/**
 * Kontrola předpokladů pro Cursor agent + MCP + CLI (bez výpisu tajemství).
 * @see .cursor/rules/40-cursor-agent-access.mdc
 */
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function ok(msg) {
  console.log(`[OK] ${msg}`);
}
function warn(msg) {
  console.log(`[CHYBÍ] ${msg}`);
}
function info(msg) {
  console.log(`[INFO] ${msg}`);
}

let exitCode = 0;

// .cursor/mcp.json
const mcpJson = join(root, '.cursor', 'mcp.json');
if (existsSync(mcpJson)) ok('.cursor/mcp.json existuje');
else {
  warn('.cursor/mcp.json nenalezen');
  exitCode = 1;
}

// MCP starter script
const mcpStart = join(root, 'scripts', 'mcp-supabase-start.mjs');
if (existsSync(mcpStart)) ok('scripts/mcp-supabase-start.mjs existuje');
else {
  warn('scripts/mcp-supabase-start.mjs chybí');
  exitCode = 1;
}

// @supabase/mcp-server-supabase
const mcpPkg = join(root, 'node_modules', '@supabase', 'mcp-server-supabase', 'package.json');
if (existsSync(mcpPkg)) ok('@supabase/mcp-server-supabase v node_modules (npm install)');
else {
  warn('Spusť: npm install (chybí @supabase/mcp-server-supabase)');
  exitCode = 1;
}

// .env.local + token key presence (never print value)
const envLocal = join(root, '.env.local');
if (!existsSync(envLocal)) {
  warn('Chybí .env.local → zkopíruj .env.local.example a doplň SUPABASE_ACCESS_TOKEN');
  exitCode = 1;
} else {
  ok('.env.local existuje');
  const raw = readFileSync(envLocal, 'utf8');
  const hasToken =
    /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*\S+/m.test(raw) || /^\s*SUPABASE_PAT\s*=\s*\S+/m.test(raw);
  if (hasToken) ok('V .env.local je nastavený SUPABASE_ACCESS_TOKEN nebo SUPABASE_PAT (hodnota se nevypisuje)');
  else {
    warn('V .env.local dopln SUPABASE_ACCESS_TOKEN=... (pro Supabase MCP)');
    exitCode = 1;
  }
}

// Git remote
const gitRemote = spawnSync('git', ['remote', '-v'], { cwd: root, encoding: 'utf8' });
if (gitRemote.status === 0 && gitRemote.stdout?.trim()) {
  ok('git remote:\n' + gitRemote.stdout.trim().split('\n').map((l) => '      ' + l).join('\n'));
} else {
  warn('git remote -v selhalo nebo nemá výstup');
  exitCode = 1;
}

// GitHub CLI
const gh = spawnSync('gh', ['auth', 'status'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
if (gh.status === 0) ok('gh auth status: přihlášeno');
else {
  warn('GitHub CLI: spusť gh auth login (gh auth status není OK)');
  info(gh.stderr?.trim() || gh.stdout?.trim() || String(gh.error || ''));
  exitCode = 1;
}

info('Vercel / Stripe MCP: Cursor → Settings → MCP → Vercel/Stripe → Sign in. Po výzvě agenta k mcp_auth dialog ne přeskakovat (nelze ověřit z tohoto skriptu).');
info('Po úpravě .env.local nebo mcp.json restartuj Cursor a v Output / MCP zkontroluj start serveru „supabase“.');

process.exit(exitCode);
