#!/usr/bin/env node
/**
 * P0 launch sanity — users, unit economics, Stripe mapping, system audit.
 *   npm run launch:sanity
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { sanitizeOutput } from './audit-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const STEPS = [
  { name: 'audit:users', critical: true },
  { name: 'audit:unit-economics', critical: false },
  { name: 'verify:stripe-tier-mapping', critical: true },
  { name: 'system:audit', critical: true },
];

/**
 * @param {string} script
 */
function runStep(script) {
  const childEnv = { ...process.env };
  delete childEnv.BASE_URL;
  return new Promise((resolve) => {
    const child = spawn(`npm run ${script}`, [], {
      cwd: root,
      shell: true,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (c) => { output += c.toString(); });
    child.stderr?.on('data', (c) => { output += c.toString(); });
    child.on('close', (code) => {
      resolve({ script, exitCode: code ?? 1, output: sanitizeOutput(output.trim()) });
    });
  });
}

console.log('=== LAUNCH SANITY ===\n');

const results = [];
for (const step of STEPS) {
  console.log(`--- ${step.name} ---`);
  const result = await runStep(step.name);
  results.push({ ...step, ...result });
  if (result.output) console.log(result.output);
  console.log('');
}

const failed = results.filter((r) => r.exitCode !== 0 && r.critical);
const warned = results.filter((r) => r.exitCode !== 0 && !r.critical);

console.log('=== SUMMARY ===');
for (const r of results) {
  const status = r.exitCode === 0 ? 'PASS' : (r.critical ? 'FAIL' : 'WARN');
  console.log(`${status} ${r.name}`);
}

if (failed.length) {
  console.log(`\nFAIL ${failed.length} critical step(s)`);
  process.exit(1);
}
if (warned.length) {
  console.log(`\nWARN ${warned.length} non-critical step(s)`);
}
console.log('\nPASS launch sanity (critical steps OK)');
process.exit(0);
