#!/usr/bin/env node
/**
 * Spouští Supabase MCP server s tokenem z .env.
 * Použití z .cursor/mcp.json:
 *   "command": "node",
 *   "args": ["scripts/mcp-supabase-start.mjs"]
 *
 * Vyžaduje v .env nebo .env.local:
 *   SUPABASE_ACCESS_TOKEN  (nebo SUPABASE_PAT)
 *   SUPABASE_PROJECT_REF   (volitelné, default: ipfyavvmmxmsjupmfnes)
 *
 * Token získáš na: https://supabase.com/dashboard/account/tokens
 */
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadEnv();

const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
if (!token) {
  console.error('Chybí SUPABASE_ACCESS_TOKEN nebo SUPABASE_PAT v .env');
  console.error('Token získáš na: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const projectRef = process.env.SUPABASE_PROJECT_REF || 'ipfyavvmmxmsjupmfnes';

// MCP server – preferuj lokální balíček (bez npx), jinak npx s shell pro Windows
const mcpPath = join(root, 'node_modules', '@supabase', 'mcp-server-supabase', 'dist', 'transports', 'stdio.js');
const useLocal = existsSync(mcpPath);
const child = useLocal
  ? spawn(process.execPath, [mcpPath, '--access-token', token, '--project-ref', projectRef], {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: projectRef },
      cwd: root,
    })
  : spawn('npx', ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', token, '--project-ref', projectRef], {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: projectRef },
      cwd: root,
      shell: true,
    });

child.on('error', (err) => {
  console.error('MCP start failed:', err);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
