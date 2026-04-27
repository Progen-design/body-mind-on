#!/usr/bin/env node
/**
 * Lokální náhled e-mailu s plánem (bez odeslání): stejný řetězec jako sendPlanEmail
 * (formatPlanHtmlForEmail + buildPlanEmailDocument z raw plan_html).
 * Spusť: node scripts/preview-plan-email.mjs
 * Výstup: cesta k .html v systémovém tempu.
 *
 * Pozn.: Nepoužíváme import planRenderer (Node bez Nextu neumí rozlišit cesty .js);
 * HTML je zkrácený vzorek ve stejném formátu jako výstup renderPlanHtmlFromStructured.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { formatPlanHtmlForEmail, buildPlanEmailDocument } from '../lib/emailTemplates.js';

const app = 'https://app.bodyandmindon.cz';
const rawHtml = `<h3>Tvoje čísla</h3>
<ul>
<li><strong>Výška:</strong> 180 cm</li>
<li><strong>Váha:</strong> 80 kg</li>
<li><strong>Cíl:</strong> Udržování</li>
</ul>
<h3>Denní cíle (makra)</h3>
<ul>
<li><strong>Kalorie:</strong> 2200 kcal</li>
<li><strong>Bílkoviny:</strong> 140 g</li>
<li><strong>Sacharidy:</strong> 220 g</li>
<li><strong>Tuky:</strong> 70 g</li>
</ul>
<h3>Mindset na tento týden</h3>
<p>Drž se plánu.</p>
<h3>Tréninkový plán</h3>
<p>Tréninků týdně: <strong>3</strong>. Níže u každého dne najdeš konkrétní cviky.</p>
<h3>Jídelníček (celý týden)</h3>
<h4>Pondělí</h4>
<p data-recipe-id="716426"><b>Snídaně:</b> <a class="spoonacular-recipe" href="${app}/api/spoonacular-recipe?id=716426" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;font-weight:600;text-decoration:underline;">Řecký jogurt s čokoládou (český název z plánu)</a></p>
<p class="meal-ingredient-portions-h" style="margin:6px 0 4px;color:#94a3b8;font-size:11px;font-weight:700;">Suroviny na 1 porci (orientačně)</p>
<ul class="meal-ingredient-portions"><li>řecký jogurt: <strong>200 g</strong></li><li>čokoládové pecičky: <strong>30 g</strong></li></ul>
<p class="meal-nutrition-line"><small>380 kcal · B 24 g · S 42 g · T 12 g · Vláknina 6 g · cca 15 min · zdraví 72/100</small></p>
<p><b>Oběd:</b> Salát dle GPT (neověřený název v HTML)</p>
<p><small><em>Součet dne (orientačně): 380 kcal, B 24 g, S 42 g, T 12 g, vláknina 6 g</em></small></p>
<p><b>Trénink tento den:</b></p>
<ul><li>Dřepy – 4×10</li></ul>
<h4>Úterý</h4>
<p><b>Večeře:</b> Ryba se zeleninou</p>
<p><b>Trénink tento den:</b></p>
<ul><li>Odpočinek.</li></ul>
<h3>Suplementace</h3>
<ul><li>Vitamín D</li></ul>
<h3>Regenerace</h3>
<ul><li>Spánek</li></ul>
<h3>Nákupní seznam</h3>
<p>Orientační suroviny.</p>
<ul><li>Jogurt</li><li>Čokoláda</li></ul>`;
const safePlanHtml = formatPlanHtmlForEmail(rawHtml);
const doc = buildPlanEmailDocument({
  safePlanHtml,
  loginBlock: '<p style="margin:0 0 16px;color:#94a3b8;font-size:14px;">(náhled: přihlašovací blok by zde byl v ostrém e-mailu)</p>',
  loginUrl: 'https://app.bodyandmindon.cz/login',
  planChangeContext: false,
  appBaseUrl: 'https://app.bodyandmindon.cz',
  firstName: 'Test',
  ctaUrl: 'https://app.bodyandmindon.cz/profil',
});

const out = join(tmpdir(), 'body-mind-on-plan-email-preview.html');
writeFileSync(out, doc, 'utf8');
console.log('Náhled e-mailu zapsán:', out);
if (!/Řecký jogurt s čokoládou/.test(doc)) {
  console.error('Kontrola selhala: očekáván český název jídla v HTML náhledu.');
  process.exit(1);
}
if (/Greek Yogurt Chocolate Parfait/i.test(doc)) {
  console.error('Kontrola selhala: v plánu by neměl být anglický titul receptu z API.');
  process.exit(1);
}
console.log('Kontrola OK: český název jídla v e-mailovém náhledu, bez anglického titulu API.');
