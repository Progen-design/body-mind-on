/**
 * ESM resolver hook — doplní .js u relativních importů z /lib (pro Node skripty mimo Next).
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../'))
    && !specifier.endsWith('.js')
    && !specifier.endsWith('.json')
    && !specifier.endsWith('.mjs')
  ) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      // fall through
    }
  }
  return nextResolve(specifier, context);
}
