// Prepinani mezi profily bylo demo funkce nad vymyslenymi ucty.
// S realnym prihlasenim (Supabase) ma clovek jeden ucet - blok jde pryc.
import fs from 'node:fs';

const uprav = (cesta, upravy) => {
  let t = fs.readFileSync(cesta, 'utf8');
  const puvodni = t;
  for (const [od, doo, popis] of upravy) {
    const i = t.indexOf(od);
    if (i === -1) { console.log('  PRESKOCENO (nenalezeno): ' + popis); continue; }
    const j = t.indexOf(doo, i);
    if (j === -1) { console.log('  PRESKOCENO (chybi konec): ' + popis); continue; }
    t = t.slice(0, i) + t.slice(j + doo.length);
    console.log('  odstraneno: ' + popis);
  }
  if (t !== puvodni) fs.writeFileSync(cesta, t);
};

console.log('Header.tsx');
uprav('src/components/Header.tsx', [
  ['                    {otherAccounts.length > 0 && (',
   '                        </AnimatePresence>\n                      </>\n                    )}\n',
   'blok prepnuti profilu v menu']
]);

console.log('ProfileSection.tsx');
uprav('src/components/ProfileSection.tsx', [
  ['          <div className="space-y-2">\n            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">\n              <Repeat',
   '              })}\n            </div>\n          </div>\n',
   'mrizka s profily k prepnuti']
]);
