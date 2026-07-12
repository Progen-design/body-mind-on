#!/usr/bin/env node
/**
 * Centrální read-only audit produkce a integrací (bez secretů / PII ve výstupu).
 *   npm run system:audit
 *
 * Každý krok pokračuje i po selhání; na konci souhrn PASS / WARN / FAIL.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { sanitizeOutput } from './audit-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** @typedef {'PASS'|'WARN'|'FAIL'} AuditStatus */

/**
 * @typedef {object} AuditStep
 * @property {string} section
 * @property {string} script npm script name
 * @property {boolean} critical FAIL when exit !== 0; otherwise WARN
 * @property {string[]} [extraArgs] passed after `--` to npm run
 */

/** @type {AuditStep[]} */
const STEPS = [
  { section: 'ENV REQUIRED', script: 'verify:env-required', critical: true },
  { section: 'VERCEL', script: 'vercel:audit', critical: false },
  { section: 'SUPABASE', script: 'verify:supabase-readonly', critical: true },
  { section: 'OPENAI', script: 'verify:openai-config', critical: true },
  { section: 'EMAIL', script: 'verify:email-config', critical: false },
  { section: 'GOOGLE CALENDAR', script: 'verify:google-calendar-config', critical: false },
  { section: 'PRODUCTION SMOKE', script: 'smoke-test:prod', critical: true },
  {
    section: 'SECURITY HEADERS',
    script: 'verify:security-headers',
    extraArgs: ['--runtime'],
    critical: true,
  },
  {
    section: 'LEGAL FOOTER',
    script: 'verify:footer-legal-links',
    extraArgs: ['--runtime'],
    critical: true,
  },
];

/**
 * @param {AuditStep} step
 * @returns {Promise<{ section: string, status: AuditStatus, exitCode: number, output: string }>}
 */
function runStep(step) {
  const extra = step.extraArgs?.length ? ` -- ${step.extraArgs.join(' ')}` : '';
  const command = `npm run ${step.script}${extra}`;

  return new Promise((resolve) => {
    const child = spawn(command, [], {
      cwd: root,
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      const raw = `${stdout}${stderr}`.trim();
      const output = sanitizeOutput(raw);
      /** @type {AuditStatus} */
      let status;
      if (exitCode === 0) {
        status = 'PASS';
      } else if (step.critical) {
        status = 'FAIL';
      } else {
        status = 'WARN';
      }
      resolve({ section: step.section, status, exitCode, output });
    });

    child.on('error', (err) => {
      const output = sanitizeOutput(err?.message || 'spawn failed');
      resolve({
        section: step.section,
        status: step.critical ? 'FAIL' : 'WARN',
        exitCode: 1,
        output,
      });
    });
  });
}

console.log('=== SYSTEM AUDIT ===');
console.log('Body & Mind ON — read-only production & integration check');
console.log('Output is sanitized (no secret values or client PII).');
console.log('');

/** @type {{ section: string, status: AuditStatus, exitCode: number, output: string }[]} */
const results = [];

for (const step of STEPS) {
  console.log(`--- ${step.section} ---`);
  const result = await runStep(step);
  results.push(result);

  if (result.output) {
    const lines = result.output.split(/\r?\n/).filter(Boolean);
    for (const line of lines.slice(0, 80)) {
      console.log(line);
    }
    if (lines.length > 80) {
      console.log(`... (${lines.length - 80} more lines truncated)`);
    }
  }

  console.log(`${result.status} ${step.section} (exit ${result.exitCode})`);
  console.log('');
}

console.log('=== SUMMARY ===');

let failCount = 0;
let warnCount = 0;
let passCount = 0;

for (const r of results) {
  console.log(`${r.status.padEnd(5)} ${r.section}`);
  if (r.status === 'FAIL') failCount += 1;
  else if (r.status === 'WARN') warnCount += 1;
  else passCount += 1;
}

console.log('');
console.log(`Total: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL`);

if (failCount > 0) {
  console.log('RESULT: FAIL — critical step(s) failed');
  process.exit(1);
}

if (warnCount > 0) {
  console.log('RESULT: PASS with warnings');
} else {
  console.log('RESULT: PASS');
}
process.exit(0);
