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

  bazalni_energie: {
    id: 'bazalni_energie',
    pojem: 'Bazální energie',
    vysvetleni:
      'Energie, kterou tělo podle hodinek spotřebovalo za den jen na základní chod — dýchání, oběh, udržení teploty. Je to odhad z tvé výšky, váhy, věku a pohlaví, ne měření. S aktivní energií se sčítá do celkového denního výdeje.'
  },

  cista_telesna_hmota: {
    id: 'cista_telesna_hmota',
    pojem: 'Čistá tělesná hmota',
    vysvetleni:
      'Hmotnost těla po odečtení tuku — svaly, kosti, orgány a voda dohromady. Není to totéž co svalová hmota, ta je jen jednou její částí. Hodnota se dopočítává z naměřeného podílu tuku, takže kolísá s tím, jak přesné bylo měření.'
  },

  tepova_frekvence: {
    id: 'tepova_frekvence',
    pojem: 'Tepová frekvence',
    vysvetleni:
      'Průměr všech tepů naměřených za den, tedy včetně chůze, tréninku i sezení u počítače. Od klidového tepu se liší právě tím, že do něj spadá i pohyb — bývá proto vyšší. Srovnávat má smysl podobné dny mezi sebou, ne den tréninkový s dnem volna.'
  },

  cas_cviceni: {
    id: 'cas_cviceni',
    pojem: 'Čas cvičení',
    vysvetleni:
      'Minuty, které hodinky vyhodnotily jako pohyb aspoň v intenzitě svižné chůze. Nepočítá se do nich celá doba tréninku, ale jen ta část, kdy byla intenzita dost vysoká. Rozhoduje o tom algoritmus Apple z tepu a pohybu, ne ty.'
  },

  hodiny_ve_stoje: {
    id: 'hodiny_ve_stoje',
    pojem: 'Hodiny ve stoje',
    vysvetleni:
      'Počet hodin dne, ve kterých ses aspoň minutu postavil a prošel. Nejde o to, jak dlouho jsi stál — hodina se počítá celá, i když ses hýbal jen chvíli. Sleduje se tím rozložení pohybu přes den, ne jeho objem.'
  },

  dechova_frekvence: {
    id: 'dechova_frekvence',
    pojem: 'Dechová frekvence',
    vysvetleni:
      'Počet nádechů za minutu, který hodinky odhadují nejčastěji během spánku. Je to dopočet z pohybu hrudníku a tepu, ne přímé měření dechu. Hodnota se objevuje jen v noci, kdy jsou hodinky na ruce a tělo v klidu.'
  },

  tuk_kg: {
    id: 'tuk_kg',
    pojem: 'Tuk v kilogramech',
    vysvetleni:
      'Kolik z tvé váhy tvoří tuková tkáň, vyjádřeno v kilogramech místo v procentech. Váha ho neměří přímo — odhaduje ho z odporu, který tělo klade slabému proudu. Když se mění váha, procenta i kilogramy se posouvají zároveň, proto se hodí sledovat obojí.'
  },

  kostni_hmota: {
    id: 'kostni_hmota',
    pojem: 'Kostní hmota',
    vysvetleni:
      'Odhad hmotnosti kostí, který chytrá váha dopočítává ze složení těla. Mění se velmi pomalu, v řádu měsíců až let, takže rozdíly mezi jednotlivými váženími jsou spíš nepřesnost měření než skutečná změna. Slouží hlavně k dopočtu ostatních složek.'
  },

  hydratace_kg: {
    id: 'hydratace_kg',
    pojem: 'Hydratace',
    vysvetleni:
      'Odhad množství vody v těle v kilogramech. Kolísá během dne podle pití, jídla, potu i denní doby, takže dvě vážení ve stejný den můžou dát znatelně jiné číslo. Právě proto se váha doporučuje vždy ve stejnou dobu, nejlépe ráno.'
  },

  spanek_celkem: {
    id: 'spanek_celkem',
    pojem: 'Spánek',
    vysvetleni:
      'Doba, kterou hodinky vyhodnotily jako spánek, bez času stráveného vzhůru. Fáze spánku (hluboký, REM, jádrový) tu nenajdeš — aplikace, která data z hodinek posílá, je neposkytuje. Ukazujeme jen to, co je opravdu naměřené.'
  },

  probuzeni_v_noci: {
    id: 'probuzeni_v_noci',
    pojem: 'Vzhůru během noci',
    vysvetleni:
      'Součet času mezi usnutím a ranním vstáváním, kdy tě hodinky vyhodnotily jako bdělého. Krátká probuzení jsou u spánku běžná a člověk si je většinou nepamatuje. Číslo je odhad z pohybu a tepu, ne záznam toho, kdy jsi měl otevřené oči.'
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
