/**
 * Stručné textové návody k základním cvikům (modal v profilu / plánu).
 */

const GUIDES = {
  squat: {
    how: 'Postav se na šířku ramen, zpevni střed těla a klesej dolů tak, jako by sis sedal na židli. Zabírají obě nohy najednou, kolena drž ve směru špiček a vrať se zpět nahoru.',
    breathing: 'Nadechni se před pohybem dolů, při cestě nahoru plynule vydechuj.',
    tempo: 'Dolů pomalu 2–3 sekundy, nahoře se nezamykat tvrdě v kolenou.',
    caution: 'Nezakulacuj záda, nezvedej paty a nepropadej koleny dovnitř.',
    easier: 'Dřep na židli nebo menší rozsah pohybu.',
  },
  lunges: {
    how: 'Udělej krok vpřed nebo vzad, zadní koleno kontrolovaně směřuj k zemi a vrať se do stoje. Každé opakování střídá nohy a vždy více pracuje jedna noha.',
    breathing: 'Nadechni se před krokem, při návratu zpět vydechuj.',
    tempo: 'Klesej kontrolovaně, nepadat dolů. Vracej se nahoru silou přední nohy.',
    caution: 'Přední koleno neposouvej výrazně přes špičku a drž rovná záda.',
    easier: 'Kratší krok nebo výpady s oporou o židli.',
  },
  pushup: {
    how: 'Polož ruce na šířku ramen, zpevni tělo v linii od hlavy po paty a spouštěj hrudník k zemi. Vrať se nahoru bez prohýbání v bedrech.',
    breathing: 'Nadechni se při spuštění dolů, vydechuj při zatlačení nahoru.',
    tempo: 'Dolů 2–3 sekundy, nahoru silou hrudníku a paží.',
    caution: 'Nepropadej v pase a nedělej pohyb jen z ramen.',
    easier: 'Kliky s koleny na zemi nebo s rukama na vyvýšené podložce.',
  },
  pull_up: {
    how: 'Chyť hrazdu na šířku ramen, zpevni tělo a vytáhni bradu nad úroveň hrazdy. Kontrolovaně se spusť dolů.',
    breathing: 'Vydechuj při tahu nahoru, nadechni se při kontrolovaném spuštění.',
    tempo: 'Tah nahoru bez švihu, spuštění 2–3 sekundy.',
    caution: 'Nešvihuj tělem a nedělej poloviční rozsah bez kontroly.',
    easier: 'Přítahy v předklonu s gumou nebo negativní shyby pomalu dolů.',
  },
  bent_over_row: {
    how: 'Mírně pokrč kolena, nakloň trup dopředu a táhni závaží k bokům. Lopatky stáhni k sobě a vrať váhu dolů.',
    breathing: 'Vydechuj při tahu k tělu, nadechni se při spuštění.',
    tempo: 'Tah 1–2 sekundy, spuštění kontrolovaně bez trhnutí.',
    caution: 'Nezaokrouluj záda a netahuj přes bolest v bedrech.',
    easier: 'Přítah jednoručky opřen o lavici nebo s odporovou gumou.',
  },
  plank: {
    how: 'Opři se o předloktí nebo dlaně, zpevni břicho a drž tělo v rovné linii.',
    breathing: 'Dýchej pravidelně, nezadržuj dech.',
    tempo: 'Drž staticky, bez propadání v bedrech.',
    caution: 'Nepropadej v pase ani nezvedej boky příliš vysoko.',
    easier: 'Kratší držení nebo prkno s koleny na zemi.',
  },
  plank_side: {
    how: 'Leh na boku, opora o předloktí, boky v linii s tělem. Zpevni břicho a drž pozici.',
    breathing: 'Dýchej klidně do boků hrudníku, nezadržuj dech.',
    tempo: 'Statický držák — stabilní linie od hlavy po kotníky.',
    caution: 'Nenechávej boky propadlé k zemi.',
    easier: 'Boční prkno s koleny na zemi.',
  },
  superman: {
    how: 'Lehni si na břicho, natáhni ruce před sebe a pomalu zvedni ruce i nohy od země. Krátce podrž a kontrolovaně polož zpět.',
    breathing: 'Vydechuj při zvedání, nadechni se při pokládání dolů.',
    tempo: 'Zvedání 2 sekundy, držení 1–2 sekundy, spuštění pomalu.',
    caution: 'Nezakláněj hlavu, pohyb dělej pomalu a netlač přes bolest v bedrech.',
    easier: 'Zvedej jen ruce, nebo jen nohy.',
  },
  glute_bridge: {
    how: 'Leh na zádech, chodidla na šířku boků. Zvedni pánev nahoru až do linie kolen–boky–ramena.',
    breathing: 'Vydechuj při zvedání pánve, nadechni se při spuštění.',
    tempo: 'Nahoru 1–2 sekundy, nahoře krátce zpevnit, dolů kontrolovaně.',
    caution: 'Nepřehýbej bedra na konci pohybu.',
    easier: 'Menší rozsah nebo jedna noha na zemi.',
  },
  mountain_climber: {
    how: 'V pozici kliku střídavě přitahuj kolena k hrudníku, břicho drž zpevněné.',
    breathing: 'Dýchej rytmicky — vydech při střídání nohou.',
    tempo: 'Střední tempo, kontrola trupu důležitější než rychlost.',
    caution: 'Nepropadej v bedrech a nezvedej boky.',
    easier: 'Pomalé střídání nohou nebo vyšší opora rukou.',
  },
  russian_twist: {
    how: 'Sed s mírně pokrčenými koleny, lehce nakloněný trup. Otáčej trupem ze strany na stranu.',
    breathing: 'Vydechuj při otočení, nadechni se uprostřed.',
    tempo: 'Kontrolované otáčení, bez trhnutí.',
    caution: 'Drž rovná záda, netoč jen rukama.',
    easier: 'Chodidla na zemi, menší rozsah otáčení.',
  },
  romanian_deadlift: {
    how: 'Stůj na šířku boků, drž váhu před stehny a s mírně pokrčenými koleny se nakláněj dopředu. Cítíš natažení zadní strany stehen a vrať se nahoru.',
    breathing: 'Nadechni se před nakloněním, vydechuj při návratu do stoje.',
    tempo: 'Dolů 2–3 sekundy, nahoru silou boků a hamstringů.',
    caution: 'Pohyb vede z boků, ne z beder — záda drž rovná.',
    easier: 'Rumunský mrtvý tah s jednoručkami nebo zvedání pánve na zemi.',
  },
  deadlift: {
    how: 'Chyť činku nebo kettlebell, zpevni střed těla a zvedej váhu při rovných zádech až do stoje.',
    breathing: 'Nadechni se a zpevni střed před zvednutím, vydechuj při vzpřímení.',
    tempo: 'Zvedání kontrolovaně, bez trhnutí z podlahy.',
    caution: 'Nezaokrouluj záda a nezvedej váhu rychlým trhnutím.',
    easier: 'Zvedání pánve nebo mrtvý tah s lehčí váhou.',
  },
  warmup: {
    how: '5 minut lehkého pohybu — chůze, kroužení rameny, boky a kolena.',
    breathing: 'Klidné dýchání nosem, bez zadržení dechu.',
    tempo: 'Lehké tempo, postupné zvyšování rozsahu.',
    caution: 'Rozcvička má být lehká, ne vyčerpávající.',
    easier: 'Stačí delší procházka a pár mobilizačních cviků.',
  },
  cooldown: {
    how: 'Po tréninku 5 minut klidné chůze a jemného protažení hlavních svalů.',
    breathing: 'Pomalé hluboké výdechy, uvolnění.',
    tempo: 'Pomalé protažení 20–30 s na sval.',
    caution: 'Netah do bolesti — držení 20–30 s stačí.',
    easier: 'Procházka a pár dýchacích cyklů.',
  },
  rest: {
    how: 'Den odpočinku nebo lehká procházka 20–30 minut.',
    breathing: 'Klidné dýchání.',
    tempo: 'Bez zátěže.',
    caution: 'Odpočinek je součást plánu — ne přeskočení regenerace.',
    easier: 'Klidový den bez další zátěže.',
  },
  goblet_squat: {
    how: 'Drž jednoručku nebo kettlebell u hrudníku, klesej s rovnými zády a vrať se nahoru.',
    breathing: 'Nadechni se před klesáním, vydechuj při stoupání.',
    tempo: 'Dolů 2–3 sekundy, nahoru plynule.',
    caution: 'Kolena drž ve směru špiček, nepropadej v pase.',
    easier: 'Menší váha nebo kratší rozsah dřepu.',
  },
  chest_press: {
    how: 'Na stroji nebo s jednoručkami tlač váhu od hrudníku, kontroluj pohyb dolů i nahoru.',
    breathing: 'Vydechuj při tlačení, nadechni se při spuštění.',
    tempo: 'Spuštění 2 sekundy, tlak 1 sekunda.',
    caution: 'Nerovnej záda příliš a netlač rameny dopředu.',
    easier: 'Lehčí váha nebo stroj s asistencí.',
  },
  lat_pulldown: {
    how: 'Chyť madlo na horní kladce, stáhni k hrudníku a kontrolovaně vrať nahoru.',
    breathing: 'Vydechuj při stažení, nadechni se při vracení.',
    tempo: 'Stažení 1–2 sekundy, návrat 2–3 sekundy.',
    caution: 'Netahuj za hlavou a nešvihuj tělem.',
    easier: 'Lehčí váha nebo užší úchop.',
  },
  hip_thrust: {
    how: 'Opři horní záda o lavici, zvedej boky s váhou přes pánvi a vrať se dolů.',
    breathing: 'Vydechuj při zvedání boků, nadechni se při spuštění.',
    tempo: 'Nahoru 1 sekunda, dolů 2 sekundy.',
    caution: 'Neprohýbej bedra na konci pohybu.',
    easier: 'Bez váhy nebo s menší činkou.',
  },
  hamstring_curl: {
    how: 'Vleže na stroji ohněte kolena a přitáhni váhu k hýždím, pak kontrolovaně spusť.',
    breathing: 'Vydechuj při přitahování, nadechni se při spuštění.',
    tempo: 'Přitáhnutí 1–2 sekundy, spuštění 2–3 sekundy.',
    caution: 'Nepřeháněj rozsah, pokud cítíš tlak v koleni.',
    easier: 'Lehčí váha nebo pomalejší tempo.',
  },
  dead_bug: {
    how: 'Leh na zádech, zpevni břicho a střídavě spouštěj protilehlou ruku a nohu bez prohýbání v bedrech.',
    breathing: 'Vydechuj při natažení končetiny, nadechni se při návratu.',
    tempo: 'Pomalý kontrolovaný pohyb, pánev stabilní.',
    caution: 'Pánev drž stabilní, pohyb pomalý.',
    easier: 'Jen pohyb rukou nebo jen nohou.',
  },
  farmer_carry: {
    how: 'Drž jednoručky po boku, zpevni střed těla a jdi krátké úseky rovně.',
    breathing: 'Dýchej pravidelně po celou dobu chůze.',
    tempo: 'Střední tempo chůze, ramena nízko.',
    caution: 'Nezakláněj se a netlač ramena k uším.',
    easier: 'Lehčí váha nebo kratší vzdálenost.',
  },
  leg_press: {
    how: 'Chodidla na plošině na šířku boků, spouštěj kolena kontrolovaně a tlač plošinu zpět bez zamykání kolen.',
    breathing: 'Nadechni se při spuštění, vydechuj při zatlačení.',
    tempo: 'Dolů 2–3 sekundy, nahoru bez trhnutí.',
    caution: 'Kolena nesmí padat dovnitř, bedra zůstávají opřená.',
    easier: 'Menší váha nebo kratší rozsah.',
  },
  bench_press: {
    how: 'Leh na lavici, chyť činku na šířku ramen, spouštěj k hrudníku a tlač nahoru.',
    breathing: 'Nadechni se při spuštění, vydechuj při tlaku.',
    tempo: 'Spuštění 2 sekundy, tlak 1 sekunda.',
    caution: 'Ramena stáhni dolů, neodrážej činku z hrudníku.',
    easier: 'Lehčí váha nebo stroj chest press.',
  },
};

/**
 * @param {string|null|undefined} canonicalKey
 * @returns {{ how: string, breathing?: string, tempo?: string, caution: string, easier: string }|null}
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
