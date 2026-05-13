// One-shot script that retones v7 email template + renderer to the BMON brand
// palette (sky #0EA5E9 + lavender #A78BFA + cyan #22D3EE on slate backgrounds).
// Idempotent: re-running on an already rebranded file is a no-op.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const FILES = [
  join(root, 'lib', 'templates', 'bmon_weekly_plan_email_v7.html'),
  join(root, 'lib', 'weeklyPlanEmailV7.js'),
];

// Order matters: replace the longer / more specific tokens first to avoid
// double-substitution.
const REPLACEMENTS = [
  // Multi-stop CTA gradient (deep purple/pink/gold → deep navy/blue/indigo/violet)
  ['#1A0B33 0%,#4C1D95 30%,#BE185D 70%,#F59E0B 100%', '#0A1018 0%,#1E40AF 30%,#4338CA 70%,#7C3AED 100%'],
  ['#1A0B33', '#0A1018'],

  // Two-stop hero/motto gradient (vivid purple→pink → sky→lavender)
  ['#A855F7 0%,#EC4899 100%', '#0EA5E9 0%,#A78BFA 100%'],

  // Brand accents
  ['#A855F7', '#0EA5E9'],
  ['#EC4899', '#A78BFA'],
  ['#F59E0B', '#22D3EE'],

  // rgba border tokens (any alpha value)
  [/rgba\(168,\s*85,\s*247,/g, 'rgba(14,165,233,'],
  [/rgba\(236,\s*72,\s*153,/g, 'rgba(167,139,250,'],
  [/rgba\(245,\s*158,\s*11,/g, 'rgba(34,211,238,'],

  // Backgrounds
  ['#0A0815', '#0A1018'],
  ['#15101F', '#121826'],
  ['#1A1428', '#1E293B'],
  ['#040308', '#050810'],
  ['#1A0F2E', '#1E293B'],
  ['#0F0B1A', '#0F172A'],
  ['#2A1F3D', '#334155'],

  // Texts (slate scale)
  ['#F8F4FF', '#F1F5F9'],
  ['#F0EBFF', '#E2E8F0'],
  ['#C4B5E0', '#94A3B8'],
  ['#B5A8D4', '#94A3B8'],
  ['#9F8FC0', '#64748B'],
  ['#7A6C99', '#475569'],
  ['#6B5C8F', '#475569'],

  // Helper colors for workout backgrounds (purple-tinged → slate-tinged)
  ['#2B0F15', '#1E0E14'],
  ['#0F2A1D', '#0E2218'],

  // Outlook fallback / signature accent
  ['#06050A', '#050810'],

  // EC4899-related shadow alphas (already remapped to A78BFA above by hex match)
  // No further substitution needed; rgba lavender already covers it.
];

function apply(content) {
  let out = content;
  for (const [pattern, replacement] of REPLACEMENTS) {
    if (pattern instanceof RegExp) {
      out = out.replace(pattern, replacement);
    } else {
      out = out.split(pattern).join(replacement);
    }
  }
  return out;
}

let totalChanges = 0;
for (const file of FILES) {
  const before = readFileSync(file, 'utf8');
  const after = apply(before);
  if (before !== after) {
    writeFileSync(file, after, 'utf8');
    const changedBytes = Math.abs(after.length - before.length);
    console.log(`rewrote: ${file} (${before.length} → ${after.length} bytes, Δ${changedBytes})`);
    totalChanges += 1;
  } else {
    console.log(`unchanged: ${file}`);
  }
}
console.log(`\n${totalChanges}/${FILES.length} files updated.`);
