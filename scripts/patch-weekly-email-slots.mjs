import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib/templates/bmon_weekly_plan_email_v2.html');
let t = readFileSync(p, 'utf8');

const replacements = [
  ['TÝDEN 19 · 2026', 'TÝDEN {{week_number}} · {{year}}'],
  ['Ahoj Jan,<br>', 'Ahoj {{user_name}},<br>'],
  ['>07</div>', '>{{days_count}}</div>'],
  ['>21</div>', '>{{meals_count}}</div>'],
  ['>04</div>', '>{{workouts_count}}</div>'],
  [
    'href="https://app.bodyandmindon.cz" class="cta-btn" style="display:inline-block;padding:20px 40px',
    'href="{{app_base_url}}" class="cta-btn" style="display:inline-block;padding:20px 40px',
  ],
  [
    'href="https://app.bodyandmindon.cz" class="cta-btn" style="display:inline-block;padding:22px 48px',
    'href="{{cta_url}}" class="cta-btn" style="display:inline-block;padding:22px 48px',
  ],
  [
    '>195<span style="font-size:16px;color:#6B6480;font-weight:400;"> cm</span>',
    '>{{height}}<span style="font-size:16px;color:#6B6480;font-weight:400;"> cm</span>',
  ],
  [
    '>95<span style="font-size:16px;color:#6B6480;font-weight:400;"> kg</span>',
    '>{{weight}}<span style="font-size:16px;color:#6B6480;font-weight:400;"> kg</span>',
  ],
  ['>Nabírání svalů</div>', '>{{goal}}</div>'],
  ['                      3000', '                      {{target_kcal}}'],
  [
    '>200<span style="font-size:14px;color:#6B6480;font-weight:400;"> g</span></td>',
    '>{{target_protein_g}}<span style="font-size:14px;color:#6B6480;font-weight:400;"> g</span></td>',
  ],
  [
    'width:80%;">&nbsp;</td>\n                    <td style="background:#1F1A2E;height:6px;line-height:6px;font-size:0;width:20%;',
    'width:{{protein_bar_width}}%;">&nbsp;</td>\n                    <td style="background:#1F1A2E;height:6px;line-height:6px;font-size:0;width:{{protein_bar_rest}}%;',
  ],
  [
    '>350<span style="font-size:14px;color:#6B6480;font-weight:400;"> g</span></td>',
    '>{{target_carbs_g}}<span style="font-size:14px;color:#6B6480;font-weight:400;"> g</span></td>',
  ],
  [
    'width:70%;">&nbsp;</td>\n                    <td style="background:#1F1A2E;height:6px;line-height:6px;font-size:0;width:30%;',
    'width:{{carbs_bar_width}}%;">&nbsp;</td>\n                    <td style="background:#1F1A2E;height:6px;line-height:6px;font-size:0;width:{{carbs_bar_rest}}%;',
  ],
  [
    '>80<span style="font-size:14px;color:#6B6480;font-weight:400;"> g</span></td>',
    '>{{target_fat_g}}<span style="font-size:14px;color:#6B6480;font-weight:400;"> g</span></td>',
  ],
  [
    'width:55%;">&nbsp;</td>\n                    <td style="background:#1F1A2E;height:6px;line-height:6px;font-size:0;width:45%;',
    'width:{{fat_bar_width}}%;">&nbsp;</td>\n                    <td style="background:#1F1A2E;height:6px;line-height:6px;font-size:0;width:{{fat_bar_rest}}%;',
  ],
];

for (const [from, to] of replacements) {
  if (!t.includes(from)) continue;
  t = t.replace(from, to);
}

t = t.replace(
  /(▌ 02 · PRAVIDLA[\s\S]*?padding:24px 40px 0 40px;">)\n          <table width="100%"[\s\S]*?Dodržuj pitný režim\.<\/td>\n            <\/tr>\n          <\/table>\n        <\/td><\/tr>/,
  '$1\n          <!--BMON_HABITS-->\n        </td></tr>'
);

t = t.replace(
  /        <!-- DAY CARD: PONDĚLÍ -->[\s\S]*?<!-- Placeholder for remaining days -->[\s\S]*?<\/td><\/tr>\n\n      <\/table>/,
  '        <!--BMON_DAYS-->\n\n      </table>'
);

t = t.replace(
  '</td></tr>\n\n<!-- ============ HERO SECTION',
  '</td></tr>\n\n<!--BMON_LOGIN_BLOCK-->\n\n<!-- ============ HERO SECTION'
);

t = t.replace(
  /<a href="https:\/\/app\.bodyandmindon\.cz" style="color:#EC4899/g,
  '<a href="{{app_base_url}}" style="color:#EC4899'
);

if (!t.includes('{{target_kcal}}')) throw new Error('target_kcal missing');
if (!t.includes('{{height}}')) throw new Error('height missing');
if (!t.includes('<!--BMON_DAYS-->')) throw new Error('BMON_DAYS missing');
if (!t.includes('<!--BMON_HABITS-->')) throw new Error('BMON_HABITS missing');

writeFileSync(p, t);
console.log('patched', p);
