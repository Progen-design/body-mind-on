#!/usr/bin/env node
/**
 * stop hook: if afterFileEdit left pending errors, ask the agent to fix them.
 */
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ERRORS_FILE = join(__dirname, '.pending-errors.log');
const MAX_FOLLOWUP = 4000;

function readStdin() {
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolvePromise(data));
  });
}

async function main() {
  const raw = await readStdin();
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }

  if (input.status !== 'completed') {
    process.exit(0);
  }

  if (!existsSync(ERRORS_FILE)) {
    process.exit(0);
  }

  const content = readFileSync(ERRORS_FILE, 'utf8').trim();
  if (!content) {
    process.exit(0);
  }

  const loopCount = Number(input.loop_count) || 0;
  if (loopCount >= 3) {
    unlinkSync(ERRORS_FILE);
    process.exit(0);
  }

  const followup = [
    'Post-edit typecheck/lint hook reported errors. Fix all issues below before marking the task complete.',
    '',
    content.length > MAX_FOLLOWUP ? `${content.slice(0, MAX_FOLLOWUP)}\n… (truncated)` : content,
  ].join('\n');

  try {
    unlinkSync(ERRORS_FILE);
  } catch {
    // ignore
  }

  process.stdout.write(JSON.stringify({ followup_message: followup }));
  process.exit(0);
}

main().catch(() => process.exit(0));
