/**
 * Stručné textové návody k základním cvikům (modal v profilu / plánu).
 */

const GUIDES = {
  squat: {
    how: 'Postav se na šířku ramen, zpevni střed těla a klesej dolů tak, jako by sis sedal na židli. Kolena drž ve směru špiček a vrať se zpět nahoru.',
    caution: 'Nezakulacuj záda, nezvedej paty a nepropadej koleny dovnitř.',
    easier: 'Dřep na židli nebo menší rozsah pohybu.',
  },
  lunges: {
    how: 'Udělej krok vpřed, obě kolena sniž pod úroveň boků a vrať se do stoje. Střídej nohy.',
    caution: 'Koleno vpřední nohy neposouvej příliš daleko přes špičku a drž rovná záda.',
    easier: 'Kratší krok nebo výpady s oporou o židli.',
  },
  pushup: {
    how: 'Polož ruce na šířku ramen, zpevni tělo v linii od hlavy po paty a spouštěj hrudník k zemi. Vrať se nahoru bez prohýbání v bedrech.',
    caution: 'Nepropadej v pase a nedělej pohyb jen z ramen.',
    easier: 'Kliky s koleny na zemi nebo s rukama na vyvýšené podložce.',
  },
  pull_up: {
    how: 'Chyť hrazdu na šířku ramen, zpevni tělo a vytáhni bradu nad úroveň hrazdy. Kontrolovaně se spusť dolů.',
    caution: 'Nešvihuj tělem a nedělej poloviční rozsah bez kontroly.',
    easier: 'Přítahy v předklonu s gumou nebo negativní shyby pomalu dolů.',
  },
  bent_over_row: {
    how: 'Mírně pokrč kolena, nakloň trup dopředu a táhni závaží k bokům. Lopatky stáhni k sobě a vrať váhu dolů.',
    caution: 'Nezaokrouhluj záda a netahuj přes bolest v bedrech.',
    easier: 'Přítah jednoručky opřen o lavici nebo s odporovou gumou.',
  },
  plank: {
    how: 'Opři se o předloktí nebo dlaně, zpevni břicho a drž tělo v rovné linii.',
    caution: 'Nepropadej v pase ani nezvedej boky příliš vysoko.',
    easier: 'Kratší držení nebo prkno s koleny na zemi.',
  },
  superman: {
    how: 'Lehni si na břicho, natáhni ruce před sebe a pomalu zvedni ruce i nohy od země. Krátce podrž a kontrolovaně polož zpět.',
    caution: 'Nezakláněj hlavu, pohyb dělej pomalu a netlač přes bolest v bedrech.',
    easier: 'Zvedej jen ruce, nebo jen nohy.',
  },
  romanian_deadlift: {
    how: 'Stůj na šířku boků, drž váhu před stehny a s mírně pokrčenými koleny se nakláněj dopředu. Cítíš natažení zadní strany stehen a vrať se nahoru.',
    caution: 'Pohyb vede z boků, ne z beder — záda drž rovná.',
    easier: 'Rumunský mrtvý tah s jednoručkami nebo zvedání pánve na zemi.',
  },
  deadlift: {
    how: 'Chyť činku nebo kettlebell, zpevni střed těla a zvedej váhu při rovných zádech až do stoje.',
    caution: 'Nezaokrouluj záda a nezvedej váhu rychlým trhnutím.',
    easier: 'Zvedání pánve nebo mrtvý tah s lehčí váhou.',
  },
  warmup: {
    how: '5 minut lehkého pohybu — chůze, kroužení rameny, boky a kolena.',
    caution: 'Rozcvička má být lehká, ne vyčerpávající.',
    easier: 'Stačí delší procházka a pár mobilizačních cviků.',
  },
  cooldown: {
    how: 'Po tréninku 5 minut klidné chůze a jemného protažení hlavních svalů.',
    caution: 'Netah do bolesti — držení 20–30 s stačí.',
    easier: 'Procházka a pár dýchacích cyklů.',
  },
  rest: {
    how: 'Den odpočinku nebo lehká procházka 20–30 minut.',
    caution: 'Odpočinek je součást plánu — ne přeskočení regenerace.',
    easier: 'Klidový den bez další zátěže.',
  },
  goblet_squat: {
    how: 'Drž jednoručku nebo kettlebell u hrudníku, klesej s rovnými zády a vrať se nahoru.',
    caution: 'Kolena drž ve směru špiček, nepropadej v pase.',
    easier: 'Menší váha nebo kratší rozsah dřepu.',
  },
  chest_press: {
    how: 'Na stroji nebo s jednoručkami tlač váhu od hrudníku, kontroluj pohyb dolů i nahoru.',
    caution: 'Nerovnej záda příliš a netlač rameny dopředu.',
    easier: 'Lehčí váha nebo stroj s asistencí.',
  },
  lat_pulldown: {
    how: 'Chyť madlo na horní kladce, stáhni k hrudníku a kontrolovaně vrať nahoru.',
    caution: 'Netahuj za hlavou a nešvihuj tělem.',
    easier: 'Lehčí váha nebo užší úchop.',
  },
  hip_thrust: {
    how: 'Opři horní záda o lavici, zvedej boky s váhou přes pánvi a vrať se dolů.',
    caution: 'Neprohýbej bedra na konci pohybu.',
    easier: 'Bez váhy nebo s menší činkou.',
  },
  hamstring_curl: {
    how: 'Vleže na stroji ohněte kolena a přitáhni váhu k hýždím, pak kontrolovaně spusť.',
    caution: 'Nepřeháněj rozsah, pokud cítíš tlak v koleni.',
    easier: 'Lehčí váha nebo pomalejší tempo.',
  },
  dead_bug: {
    how: 'Leh na zádech, zpevni břicho a střídavě spouštěj protilehlou ruku a nohu bez prohýbání v bedrech.',
    caution: 'Pánev drž stabilní, pohyb pomalý.',
    easier: 'Jen pohyb rukou nebo jen nohou.',
  },
  farmer_carry: {
    how: 'Drž jednoručky po boku, zpevni střed těla a jdi krátké úseky rovně.',
    caution: 'Nezakláněj se a netlač ramena k uším.',
    easier: 'Lehčí váha nebo kratší vzdálenost.',
  },
};

/**
 * @param {string|null|undefined} canonicalKey
 * @returns {{ how: string, caution: string, easier: string }|null}
 */
export function getExerciseInstructionGuide(canonicalKey) {
  const key = String(canonicalKey || '').trim().toLowerCase();
  if (!key) return null;
  return GUIDES[key] || null;
}

/**
 * @param {string|null|undefined} canonicalKey
 * @returns {boolean}
 */
export function hasExerciseInstructionGuide(canonicalKey) {
  return Boolean(getExerciseInstructionGuide(canonicalKey));
}

export default getExerciseInstructionGuide;
