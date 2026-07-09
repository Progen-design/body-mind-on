#!/usr/bin/env node
/**
 * afterFileEdit hook: run typecheck + lint on edited .ts/.tsx files.
 * Accumulates errors for the stop hook to surface to the agent.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ERRORS_FILE = join(__dirname, '.pending-errors.log');
const MAX_OUTPUT = 6000;

function readStdin() {
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolvePromise(data));
  });
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 10 * 1024 * 1024,
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return { code: result.status ?? 1, out };
}

function truncate(text) {
  if (!text || text.length <= MAX_OUTPUT) return text;
  return `${text.slice(0, MAX_OUTPUT)}\n… (truncated)`;
}

async function main() {
  const raw = await readStdin();
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }

  const filePath = input.file_path || '';
  if (!/\.(ts|tsx)$/i.test(filePath)) {
    process.exit(0);
  }

  const projectRoot = (input.workspace_roots && input.workspace_roots[0])
    || resolve(__dirname, '..', '..');
  const relPath = relative(projectRoot, filePath).replace(/\\/g, '/');
  const errors = [];

  const tsc = run('npm', ['run', 'typecheck'], projectRoot);

  if (tsc.code !== 0) {
    errors.push(`## Typecheck failed\n\`\`\`\n${truncate(tsc.out)}\n\`\`\``);
  }

  const lint = run('npx', ['next', 'lint', '--file', relPath], projectRoot);
  if (lint.code !== 0) {
    errors.push(`## Lint failed for ${relPath}\n\`\`\`\n${truncate(lint.out)}\n\`\`\``);
  }

  mkdirSync(dirname(ERRORS_FILE), { recursive: true });

  if (errors.length > 0) {
    const block = `\n--- ${relPath} @ ${new Date().toISOString()} ---\n${errors.join('\n\n')}\n`;
    appendFileSync(ERRORS_FILE, block, 'utf8');
    process.stdout.write(JSON.stringify({
      additional_context: `Post-edit checks found issues in ${relPath}. Fix typecheck/lint errors before finishing.\n\n${errors.join('\n\n')}`,
    }));
  } else {
    writeFileSync(ERRORS_FILE, '', 'utf8');
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
