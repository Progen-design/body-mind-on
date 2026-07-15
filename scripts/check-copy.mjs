#!/usr/bin/env node
/**
 * Kontrola copy o chytrých zařízeních — viz docs/copy-rules.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WEB = fs.existsSync(path.join(ROOT, 'lib', 'links.ts'));

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '_archive',
  'bodyandmindon-landing',
  'agent-tools',
  '.specstory',
  'agent-transcripts',
]);

const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.html', '.md']);

const WEB_WHITELIST_FILES = [
  'components/autopilot.tsx',
  'components/device-interest-panel.tsx',
  'components/weight-chart.tsx',
  'app/faq/page.tsx',
];

const APP_WHITELIST_FILES = [
  'components/profile/WithingsBodyDevelopmentSection.js',
  'components/profile/WithingsProfileCard.js',
  'components/SmartScaleChoiceField.js',
  'components/profile/PreferencesOverlay.jsx',
  'pages/withings-connect.js',
  'lib/smartScalePreference.js',
];

const APP_WHITELIST_PREFIXES = ['lib/withings/', 'pages/api/withings/', 'pages/withings-connect.js'];

const PATTERNS = [
  { re: /Napojíš chytrou váhu/i, label: 'Napojíš chytrou váhu' },
  { re: /o zbytek se nestaráš/i, label: 'o zbytek se nestaráš' },
  { re: /postavíš se na váhu, nebo/i, label: 'postavíš se na váhu, nebo' },
  { re: /váha pošle data sama/i, label: 'váha pošle data sama' },
  { re: /data\s+si\s+ber\w*\s+z\s+.{0,24}váhy/i, label: 'data bere z váhy' },
  { re: /Systém si data bere z chytré váhy/i, label: 'Systém si data bere z chytré váhy' },
  { re: /Bez chytré váhy stačí/i, label: 'Bez chytré váhy stačí' },
  { re: /napoj\w*\s+(chytrou\s+)?váhu\s*—/i, label: 'napoj… váhu —' },
];

function stripCheckRegions(content) {
  const lines = content.split('\n');
  const stack = [];
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('copy-check:whitelist:start')) {
      stack.push(true);
      continue;
    }
    if (line.includes('copy-check:whitelist:end')) {
      stack.pop();
      continue;
    }
    if (line.includes('copy-check:ignore')) continue;
    if (stack.length > 0) continue;
    out.push({ line: i + 1, text: line });
  }

  return out;
}

function isWhitelistedFile(rel) {
  const normalized = rel.replace(/\\/g, '/');

  if (normalized === 'docs/copy-rules.md' || normalized === 'scripts/check-copy.mjs') {
    return true;
  }

  if (IS_WEB) {
    return WEB_WHITELIST_FILES.some((f) => normalized === f || normalized.endsWith(`/${f}`));
  }

  if (APP_WHITELIST_FILES.some((f) => normalized === f || normalized.endsWith(`/${f}`))) {
    return true;
  }
  return APP_WHITELIST_PREFIXES.some((p) => normalized.startsWith(p));
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, files);
    else if (EXT.has(path.extname(ent.name))) files.push(full);
  }
  return files;
}

const violations = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (isWhitelistedFile(rel)) continue;

  const content = fs.readFileSync(file, 'utf8');
  const lines = stripCheckRegions(content);

  for (const { line, text } of lines) {
    for (const { re, label } of PATTERNS) {
      if (re.test(text)) {
        violations.push({ file: rel, line, label, text: text.trim() });
        break;
      }
    }
  }
}

if (violations.length) {
  console.error('copy-check: zakázané vzory copy o chytrých zařízeních:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.label}]`);
    console.error(`    ${v.text}\n`);
  }
  console.error(`Celkem: ${violations.length}. Viz docs/copy-rules.md`);
  process.exit(1);
}

console.log(`copy-check: OK (${IS_WEB ? 'bodyandmindon-web' : 'body-mind-on'})`);
