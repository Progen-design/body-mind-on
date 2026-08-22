/**
 * GLOSÁŘ POJMŮ.
 *
 * Uživatel se doptá, když něčemu nerozumí — bez AI, okamžitě, deterministicky.
 * Nahrazuje to, co měl obstarat předstíraný chat s TEDem.
 *
 * PRAVIDLA PRO TEXTY:
 * - Vysvětlují, CO ten údaj je a proč se sleduje. Nehodnotí konkrétní čísla
 *   uživatele a nedávají doporučení. Žádné „tvoje HRV je nízké".
 * - Žádné diagnózy. U zdravotních pojmů se drží popisu, ne závěru.
 * - Dvě až tři věty, česky, bez marketingu a bez pseudovědy.
 * - U metrik, kde je mezilidské srovnání typický chybný závěr (HRV, klidový
 *   tep), se to říká výslovně.
 *
 * VYSVĚTLIVKU MÁ JEN POJEM, KTERÝ V APLIKACI OPRAVDU JE. Glosář do zásoby se
 * nedělá. RIR ani RPE tu proto nejsou — zmizely z UI v Etapě 3.3 spolu
 * s vymyšlenými radami a vrátí se, až budou skutečným polem.
 *
 * MODUL JE ČISTÝ — bez importů, aby šel spustit i node --test bez transpilace
 * a sdílet se serverem.
 */

/** @typedef {{ id: string, pojem: string, vysvetleni: string }} Pojem */

/** @type {Record<string, Pojem>} */
export const GLOSAR = {
  skore_regenerace: {
    id: 'skore_regenerace',
    pojem: 'Skóre regenerace',
    vysvetleni:
      'Souhrnné číslo od 0 do 100, které z naměřené variability tepu, klidového tepu a spánku odhaduje, jak jsi na tom s odpočinkem. Není to diagnóza ani hodnocení tvého výkonu — jen shrnutí toho, co hodinky za noc naměřily. Když data chybí, číslo se nezobrazí.'
  },

  hrv: {
    id: 'hrv',
    pojem: 'HRV (variabilita srdečního tepu)',
    vysvetleni:
      'Rozdíly v délce mezer mezi jednotlivými údery srdce, měřené v milisekundách. Používá se jako nepřímá známka toho, jak je tělo odpočaté — vyšší hodnoty obvykle doprovázejí odpočinek, nižší zátěž nebo stres. Hodnota hodně kolísá ze dne na den, takže smysl dává spíš trend než jedno ráno.'
  },

  zakladna_hrv: {
    id: 'zakladna_hrv',
    pojem: 'Základna HRV',
    vysvetleni:
      'Tvoje obvyklá hodnota variability tepu, spočítaná z předchozích měření. Sama o sobě nic neříká — smysl dává až srovnání: dnešní hodnota nad základnou obvykle znamená, že jsi odpočatý, pod ní že tělo ještě něco dohání. Každý má základnu jinde, porovnávat ji s někým dalším nemá cenu.'
  },

  klidovy_tep: {
    id: 'klidovy_tep',
    pojem: 'Klidový tep',
    vysvetleni:
      'Tep naměřený v klidu, typicky ráno nebo ve spánku. Sleduje se hlavně jeho vývoj v čase, ne jednotlivé číslo — dlouhodobý pokles bývá známkou lepší kondice, náhlé zvýšení může doprovázet únavu, stres nebo nemoc. Co je „normální", se člověk od člověka výrazně liší.'
  },

  visceralni_tuk: {
    id: 'visceralni_tuk',
    pojem: 'Viscerální tuk',
    vysvetleni:
      'Tuk uložený hlouběji v břišní dutině kolem orgánů, na rozdíl od toho pod kůží. Chytrá váha ho neměří přímo, jen odhaduje z průchodu slabého proudu tělem, takže ber číslo jako orientační. Sledovat se vyplatí jeho směr v čase, ne přesnou hodnotu.'
  },

  bazalni_metabolismus: {
    id: 'bazalni_metabolismus',
    pojem: 'Bazální metabolismus',
    vysvetleni:
      'Odhad energie, kterou tělo spotřebuje za den v naprostém klidu — jen na dýchání, oběh a udržení teploty. Je to spodní hranice, ne tvůj celkový denní výdej; ten je vyšší o všechno, co za den uděláš. Číslo z váhy je dopočet ze složení těla, ne měření.'
  },

  bmi: {
    id: 'bmi',
    pojem: 'BMI',
    vysvetleni:
      'Poměr hmotnosti a druhé mocniny výšky. Je to hrubé orientační číslo pro populaci, které nerozlišuje sval od tuku — u člověka s vyšším podílem svalů vychází vysoké, aniž by to o něm cokoli vypovídalo. Když máš změřené složení těla, řekne ti víc než BMI.'
  },

  aktivni_energie: {
    id: 'aktivni_energie',
    pojem: 'Aktivní energie',
    vysvetleni:
      'Energie, kterou jsi podle hodinek spálil pohybem — nad rámec toho, co tělo spotřebuje v klidu. Je to odhad ze srdečního tepu a pohybu, ne měření, takže se mezi zařízeními liší. Porovnávat má smysl svoje vlastní dny mezi sebou.'
  },

  spo2: {
    id: 'spo2',
    pojem: 'Okysličení krve (SpO₂)',
    vysvetleni:
      'Podíl červeného krevního barviva, které právě nese kyslík, měřený senzorem na zápěstí. Hodnota z hodinek je orientační a citlivá na to, jak řemínek sedí a jestli jsi v klidu. Jednotlivé nižší měření obvykle znamená spíš špatný kontakt senzoru než něco jiného.'
  },

  makroziviny: {
    id: 'makroziviny',
    pojem: 'Makroživiny',
    vysvetleni:
      'Bílkoviny, sacharidy a tuky — tři složky jídla, ze kterých tělo bere energii. Gram bílkovin i sacharidů nese asi 4 kcal, gram tuku asi 9 kcal, takže stejná hmotnost jídla může mít dost odlišnou energii. V jídelníčku vidíš, kolik z každé jsi za den snědl.'
  },

  zapis_serii: {
    id: 'zapis_serii',
    pojem: 'Zápis „3 × 8–10"',
    vysvetleni:
      'První číslo je počet sérií, druhé rozsah opakování v jedné sérii — „3 × 8–10" tedy znamená třikrát osm až deset opakování. Když je za křížkem čas („3 × 40 s"), cvik se místo počítání opakování drží nebo opakuje po danou dobu. Mezi sériemi se odpočívá.'
  }
};

/** Pořadí pro výpis, kdyby se glosář někdy zobrazoval celý. */
export const POJMY = Object.values(GLOSAR);

/**
 * Vysvětlivka podle id. Vrací null pro neznámý pojem — volající pak
 * otazník nezobrazí, místo aby ukázal prázdné okno.
 * @param {string} id
 * @returns {Pojem|null}
 */
export function najdiPojem(id) {
  if (!id || typeof id !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(GLOSAR, id) ? GLOSAR[id] : null;
}
