/**
 * ESM resolve hook: doplní `.js` u bezpříponových importů uvnitř `lib/`.
 *
 * PROČ. `lib/planRenderer.js` a spol. píšou `import … from './supabaseServer'`,
 * což Next zvládne, ale holý Node ESM ne. Skripty v `scripts/` proto renderer
 * dosud nemohly zavolat (viz poznámka v scripts/preview-plan-email.mjs).
 * Hook je čistě rozlišovací — nemění chování modulů, jen dohledá příponu.
 */
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw err;
    for (const pripona of ['.js', '.mjs', '/index.js']) {
      const kandidat = new URL(specifier + pripona, context.parentURL);
      if (existsSync(fileURLToPath(kandidat))) {
        return nextResolve(specifier + pripona, context);
      }
    }
    throw err;
  }
}
