// Vercel nedovoli prekryvajici se vzory ve "functions" - siroky api/**/*.js
// zabral vsechny funkce a konkretni zaznamy pak neodpovidaly nicemu, cimz
// build spadl. Vzory proto musi byt disjunktni.
//
// lib/health/* jsou .ts soubory. Node 24 typy strippuje sam, jen se ty soubory
// musi do balicku funkce dostat - nft je pres import z .js nezatrasuje.
// Potrebuji je jen routy pod api/health/ a jeden cron.
import fs from 'node:fs';

const cesta = 'vercel.json';
const conf = JSON.parse(fs.readFileSync(cesta, 'utf8'));

// zrusit siroky vzor i plosne includeFiles z minuleho pokusu
delete conf.functions['api/**/*.js'];
for (const hodnota of Object.values(conf.functions)) {
  if (hodnota.includeFiles === 'lib/**') delete hodnota.includeFiles;
}

// osm rout pod api/health/ - zadny jiny zaznam tam nesaha, takze bez prekryvu
conf.functions['api/health/**/*.js'] = { includeFiles: 'lib/health/**' };

// cron pouziva lib/appleHealthDailyReview.js, ktery cte z lib/health/*.ts
const cron = 'api/cron/apple-health-daily-review.js';
conf.functions[cron] = { ...(conf.functions[cron] || {}), includeFiles: 'lib/health/**' };

fs.writeFileSync(cesta, JSON.stringify(conf, null, 2) + '\n');

console.log('zaznamu ve functions: ' + Object.keys(conf.functions).length);
console.log('s includeFiles: ' +
  Object.entries(conf.functions).filter(([, v]) => v.includeFiles).map(([k]) => k).join(', '));
console.log('cronu: ' + conf.crons.length);
