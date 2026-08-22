// Kazda funkce s vlastnim zaznamem ve "functions" prebiji obecny vzor,
// takze includeFiles musi mit i ona. Bez toho se do balicku nedostanou
// soubory z lib/ (vcetne .ts) a funkce spadne na ERR_MODULE_NOT_FOUND.
import fs from 'node:fs';

const cesta = 'vercel.json';
const conf = JSON.parse(fs.readFileSync(cesta, 'utf8'));

let doplneno = 0;
for (const [klic, hodnota] of Object.entries(conf.functions || {})) {
  if (!hodnota.includeFiles) {
    hodnota.includeFiles = 'lib/**';
    doplneno += 1;
  }
}

fs.writeFileSync(cesta, JSON.stringify(conf, null, 2) + '\n');
console.log('funkci celkem: ' + Object.keys(conf.functions).length);
console.log('doplneno includeFiles: ' + doplneno);
