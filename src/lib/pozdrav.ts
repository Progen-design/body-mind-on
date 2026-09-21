// Pozdrav podle denní doby, s volitelným oslovením — PROMPT_DNES_HERO.md.
//
// AUTOMATICKÉ SKLOŇOVÁNÍ JMEN CHYBUJE (Honza → Honzo zvládne, příjmení,
// cizí a zdrobnělá jména ne). „Jak ti máme říkat?" proto ukládá text
// PŘÍMO V 5. PÁDU (uživatel ho tak sám napsal) — tahle funkce ho jen
// nalepí za pozdrav, nic neskloňuje. Dokud pole není vyplněné, pozdrav je
// BEZ JMÉNA: „Dobrý večer, Jan" by bylo česky špatně (1. pád místo 5.).
import { casVPraze } from './casVPraze.ts';

export function pozdrav(ted: Date, oslovovaciJmeno: string | null | undefined): string {
  const { hodina } = casVPraze(ted);
  const zaklad = hodina < 10 ? 'Dobré ráno' : hodina < 17 ? 'Dobrý den' : 'Dobrý večer';
  const jmeno = String(oslovovaciJmeno || '').trim();
  return jmeno ? `${zaklad}, ${jmeno}` : `${zaklad}.`;
}
