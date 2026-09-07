/**
 * Datum pro člověka — evropské pořadí DEN. MĚSÍC.
 *
 * PROČ VLASTNÍ FUNKCE. Popisky os grafů si datum skládaly ručně a každý
 * graf jinak. `adapteryZdravi.trend()` dělal
 * `local_date.slice(5).replace('-', '.')`, což z „2026-09-01" vyrobilo
 * „09.01" — americké pořadí měsíc-den. Na ose HRV se to četlo jako
 * 9. ledna, u vývoje váhy vedle toho stálo správné „1. 9.". Formát je
 * proto na jednom místě, ať se to nemůže rozejít znovu.
 *
 * ZÁMĚRNĚ SE NEPARSUJE PŘES `new Date()`. Holé „YYYY-MM-DD" je v JS
 * půlnoc UTC a v západních zónách by se popisek posunul o den zpátky.
 * Řetězec se jen rozdělí — tady se nic nepočítá, jen přepisuje.
 */
export function kratkeDatumCS(iso: string | null | undefined): string {
  const [rok, mesic, den] = String(iso || '').slice(0, 10).split('-');
  const m = Number(mesic);
  const d = Number(den);
  const platne =
    /^\d{4}$/.test(String(rok)) &&
    Number.isInteger(m) && m >= 1 && m <= 12 &&
    Number.isInteger(d) && d >= 1 && d <= 31;
  return platne ? `${d}. ${m}.` : '';
}
