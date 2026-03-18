// /lib/generatePlan.js
import { supabaseServer } from './supabaseServer';
import { validatePublishedPlanHtml } from './validatePlanHtml';
import { validatePlanTruth } from './validatePlanTruth';
import { sendPlanEmail } from './mail';
import { runAgent } from './runAgent';
import { enrichPlanContent } from './enrichPlanContent';
import { resolveToCanonicalKey, normalizeExerciseLookupKey } from './exerciseCanonicalMap';
import { getAgentConfig } from './getAgentConfig';
import { loadAgentDocumentsContext } from './loadAgentDocumentsContext';

async function runAssistantWithPrompt(userMessage, existingThreadId = null, userId = null) {
  const result = await runAgent('trainer', {
    userId: userId ?? null,
    input: { prompt: userMessage },
  });
  return {
    rawContent: result.rawContent,
    threadId: null,
  };
}

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/** Pro GPT: pouze standard | vegetarian | vegan (dle instrukcí asistenta). */
function normalizeDietTypeForGpt(raw) {
  if (!raw || typeof raw !== 'string') return 'standard';
  const t = raw.toLowerCase().trim();
  if (t === 'vegetarian' || t === 'vegetarián') return 'vegetarian';
  if (t === 'vegan') return 'vegan';
  return 'standard';
}

/** Z poznámek (když v DB chybí diet_type/dietary_restrictions) odvodí diet_type a preferences. */
function parseDietFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return { diet_type: null, preferences: '' };
  const s = notes.trim();
  let diet_type = null;
  if (/Vegetarián|vegetarian/i.test(s)) diet_type = 'vegetarian';
  else if (/Vegan|vegan/i.test(s)) diet_type = 'vegan';
  return { diet_type, preferences: s };
}

/** Sestaví řetězec preferences pro GPT: dietní typ (pokud není veg/vegan) + co nejí + potraviny k vynechání + poznámky. */
function buildPreferencesForGpt(dietTypeRaw, dietaryRestrictions, foodsToAvoid, notes) {
  const parts = [];
  const t = (dietTypeRaw || '').toLowerCase().trim();
  const dietLabels = {
    gluten_free: 'Bez lepku',
    lactose_free: 'Bez laktózy',
    paleo: 'Paleo',
    low_carb: 'Nízkosacharidová',
    other: 'Jiné',
  };
  if (t && t !== 'vegetarian' && t !== 'vegan' && dietLabels[t]) parts.push(dietLabels[t]);
  if (dietaryRestrictions && dietaryRestrictions.trim()) parts.push(dietaryRestrictions.trim());
  if (foodsToAvoid && foodsToAvoid.trim()) parts.push('Potraviny k vynechání z jídelníčku: ' + foodsToAvoid.trim());
  if (notes && notes.trim()) parts.push(notes.trim());
  return parts.length ? parts.join('. ') : '';
}

function extractHtmlFromAiOutput(raw) {
  if (!raw || typeof raw !== 'string') return raw || '';
  let s = raw.trim();

  s = s.replace(/^```\s*html\s*\n?/i, '').replace(/\n?```\s*$/g, '').trim();
  s = s.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/g, '').trim();
  s = s.replace(/^(html|HTML)(\s*\n|\s+)/i, '$2').trim();

  if (/^html\n/i.test(s)) s = s.replace(/^html\n/i, '');
  if (/^html\s*/i.test(s)) s = s.replace(/^html\s*/i, '').trim();

  return s.trim();
}

/** Extrahuje a parsuje JSON z výstupu AI (podporuje ```json ... ```). */
function extractJsonFromAiOutput(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  s = s.replace(/^```\s*json\s*\n?/i, '').replace(/\n?```\s*$/g, '').trim();
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Vrací true, pokud v textu (HTML) jsou slova zakázaná pro daný diet_type. */
function planViolatesDiet(html, dietType) {
  if (!html || typeof html !== 'string') return false;
  const diet = (dietType || '').toLowerCase().trim();
  if (diet !== 'vegetarian' && diet !== 'vegan') return false;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const normalize = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const has = (...words) => words.some((w) => normalize(text).includes(normalize(w)));
  // Maso, ryby, drůbež – zakázáno pro vegetarian i vegan
  if (has('kuřecí', 'kuře', 'chicken', 'losos', 'salmon', 'ryb', 'fish', 'maso', 'hovězí', 'vepř', 'drůbež', 'drubez', 'krůt', 'kruta', 'treska', 'tuna', 'steak', 'biftek')) return true;
  // Pro vegan navíc vejce, mléčné, med, želatina
  if (diet === 'vegan' && has('vejce', 'vajec', 'egg', 'sýr', 'syr', 'cheese', 'mléko', 'mleko', 'milk', 'jogurt', 'smetan', 'šlehač', 'slehac', 'tvaroh', 'syrovátk', 'whey', 'med', 'želatina', 'zelatina')) return true;
  return false;
}

/** Vrací true, pokud plán obsahuje lepek při preferences „Bez lepku“. */
function planViolatesGlutenFree(html, preferences) {
  if (!html || !preferences || typeof preferences !== 'string') return false;
  const prefs = preferences.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (!prefs.includes('lepk') && !prefs.includes('bez lepku') && !prefs.includes('gluten')) return false;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const glutenWords = ['psenice', 'psenic', 'zito', 'zitna', 'jecmen', 'spalda', 'spald', 'testovin', 'bulgur', 'kuskus', 'knedlik', 'chleb', 'hladka mouka', 'pšeničná mouka'];
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return glutenWords.some((w) => text.includes(norm(w)));
}

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/** Normalizovaný klíč pro meal_key / enrichment lookup (lowercase, bez diakritiky, collapse spaces). */
function normalizedMealKey(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 7 různých snídaní / obědů / večeří podle diet_type – žádný den neopakuje stejné jídlo. */
const MEAL_ROTATION = {
  standard: {
    breakfasts: [
      { text: 'Ovesná kaše s banánem, vejce, čaj', key: 'ovesna kase s bananem vejce caj' },
      { text: 'Jogurt s müsli a ovocem, celozrnný toast', key: 'jogurt s musli a ovocem celozrnny toast' },
      { text: 'Vajíčka na měkko, celozrnný chléb, zelenina', key: 'vajicka na mekko celozrnny chleb zelenina' },
      { text: 'Tvaroh s ovocem a ořechy, čaj', key: 'tvaroh s ovocem a orechy caj' },
      { text: 'Palačinky z ovesných vloček s ovocem', key: 'palacinky z ovesnych vlocek s ovocem' },
      { text: 'Smoothie s banánem a proteinem, toast s avokádem', key: 'smoothie s bananem a proteinem toast s avokadem' },
      { text: 'Omeleta se zeleninou, žitný chléb', key: 'omeleta se zeleninou zitny chleb' },
    ],
    lunches: [
      { text: 'Kuřecí prsa s rýží a zeleninou', key: 'kureci prsa s ryzi a zeleninou' },
      { text: 'Grilovaný losos s bramborami a salát', key: 'grilovany losos s bramborami a salat' },
      { text: 'Hovězí maso na přírodno s quinoou a zeleninou', key: 'hovezi maso na prirodno s quinoou a zeleninou' },
      { text: 'Krůtí plátek s batáty a dušená zelenina', key: 'kruti platek s bataty a dusena zelenina' },
      { text: 'Ryba s rýží a zeleninovým salátem', key: 'ryba s ryzi a zeleninovym salatem' },
      { text: 'Kuřecí salát s avokádem a celozrnným pečivem', key: 'kureci salat s avokadem a celozrnnym pecivem' },
      { text: 'Těstoviny s kuřecím masem a zeleninou', key: 'testoviny s kurecim masem a zeleninou' },
    ],
    dinners: [
      { text: 'Ryba s bramborami a salát', key: 'ryba s bramborami a salat' },
      { text: 'Kuřecí prsa s batáty a zeleninou', key: 'kureci prsa s bataty a zeleninou' },
      { text: 'Zeleninové curry s rýží', key: 'zeleninove curry s ryzi' },
      { text: 'Pečená krůta se zeleninou a bramborami', key: 'pecena kruta se zeleninou a bramborami' },
      { text: 'Grilovaná zelenina s tofu a rýží', key: 'grilovana zelenina s tofu a ryzi' },
      { text: 'Polévka s chlebem, zeleninový salát s vejcem', key: 'polevka s chlebem zeleninovy salat s vejcem' },
      { text: 'Losos s quinoou a zeleninovým salátem', key: 'losos s quinoou a zeleninovym salatem' },
    ],
    breakfasts_alt: [
      { text: 'Pohanková kaše s jablkem, čaj', key: 'pohankova kase s jablkem caj' },
      { text: 'Celozrnná houska s tvarohem a zeleninou', key: 'celozrnna houska s tvarohem a zeleninou' },
      { text: 'Míchaná vajíčka s žitným chlebem', key: 'michana vajicka s zitnym chlebem' },
      { text: 'Jogurt s ořechy a medem', key: 'jogurt s orechy a medem' },
      { text: 'Omeleta s bylinkami, zelenina', key: 'omeleta s bylinkami zelenina' },
      { text: 'Ovesné vločky s hruškou a skořicí', key: 'ovesne vlocky s hruskou a skoricí' },
      { text: 'Tvarohová pomazánka, celozrnný chléb', key: 'tvarohova pomazanka celozrnny chleb' },
    ],
    lunches_alt: [
      { text: 'Krůtí wrap s zeleninou', key: 'kruti wrap s zeleninou' },
      { text: 'Pečená ryba s bramborami a brokolicí', key: 'pecena ryba s bramborami a brokolici' },
      { text: 'Kuřecí vývar s rýží a zeleninou', key: 'kureci vyvar s ryzi a zeleninou' },
      { text: 'Salát s grilovaným kuřetem a quinoou', key: 'salat s grilovanym kurecetem a quinoou' },
      { text: 'Těstoviny s krůtím masem a bazalkou', key: 'testoviny s krutim masem a bazalkou' },
      { text: 'Zeleninový guláš s celozrnným chlebem', key: 'zeleninovy gulas s celozrnnym chlebem' },
      { text: 'Losos na páře s batáty', key: 'losos na pare s bataty' },
    ],
    dinners_alt: [
      { text: 'Kuřecí salát s avokádem', key: 'kureci salat s avokadem' },
      { text: 'Dušená krůta s rýží a zeleninou', key: 'dusena kruta s ryzi a zeleninou' },
      { text: 'Ryba na grilu s bramborami', key: 'ryba na grilu s bramborami' },
      { text: 'Hovězí pošírované s quinoou', key: 'hovezi posirovane s quinoou' },
      { text: 'Zeleninová frittata s bramborem', key: 'zeleninova frittata s bramborem' },
      { text: 'Polévka dýňová, celozrnný chléb', key: 'polevka dynova celozrnny chleb' },
      { text: 'Tofu na způsob steak s rýží', key: 'tofu na zpusob steak s ryzi' },
    ],
  },
  vegetarian: {
    breakfasts: [
      { text: 'Ovesná kaše s banánem a medem, čaj', key: 'ovesna kase s bananem a medem caj' },
      { text: 'Jogurt s müsli a ovocem, celozrnný toast', key: 'jogurt s musli a ovocem celozrnny toast' },
      { text: 'Vajíčka na měkko, celozrnný chléb, zelenina', key: 'vajicka na mekko celozrnny chleb zelenina' },
      { text: 'Tvaroh s ovocem a ořechy, čaj', key: 'tvaroh s ovocem a orechy caj' },
      { text: 'Palačinky z ovesných vloček s ovocem', key: 'palacinky z ovesnych vlocek s ovocem' },
      { text: 'Smoothie s banánem, toast s avokádem', key: 'smoothie s bananem toast s avokadem' },
      { text: 'Omeleta se špenátem a sýrem, žitný chléb', key: 'omeleta se spinatem a syrem zitny chleb' },
    ],
    lunches: [
      { text: 'Čočka s rýží, zeleninový salát', key: 'cocka s ryzi zeleninovy salat' },
      { text: 'Sýr s celozrnným chlebem, zelenina', key: 'syr s celozrnnym chlebem zelenina' },
      { text: 'Quinoa salát s cizrnou a paprikou', key: 'quinoa salat s cizrnou a paprikou' },
      { text: 'Zeleninové rizoto s parmezánem', key: 'zeleninove rizoto s parmezanem' },
      { text: 'Falafel s hummusem a zeleninou', key: 'falafel s hummusem a zeleninou' },
      { text: 'Těstoviny s pestem a tvarohem', key: 'testoviny s pestem a tvarohem' },
      { text: 'Frittata se zeleninou a brambory', key: 'frittata se zeleninou a brambory' },
    ],
    dinners: [
      { text: 'Zeleninové placky s jogurtovým dipem', key: 'zeleninove placky s jogurtovym dipem' },
      { text: 'Čočka na kyselo, rýže, salát', key: 'cocka na kyselo ryze salat' },
      { text: 'Tofu s quinoou a dušená zelenina', key: 'tofu s quinoou a dusena zelenina' },
      { text: 'Ratatouille s quinoou a zeleninou', key: 'ratatouille s quinoou a zeleninou' },
      { text: 'Grilovaný sýr s bramborami a salát', key: 'grilovany syr s bramborami a salatem' },
      { text: 'Zeleninová polévka s chlebem a vejcem', key: 'zeleninova polevka s chlebem a vejcem' },
      { text: 'Cizrnový salát s pečivem', key: 'cizrnovy salat s pecivem' },
    ],
    breakfasts_alt: [
      { text: 'Pohanková kaše s ovocem, čaj', key: 'pohankova kase s ovocem caj' },
      { text: 'Jogurt s vločkami a medem', key: 'jogurt s vlockami a medem' },
      { text: 'Omeleta se sýrem a rajčaty', key: 'omeleta se syrem a rajcaty' },
      { text: 'Tvaroh s ovocem, celozrnný toast', key: 'tvaroh s ovocem celozrnny toast' },
      { text: 'Smoothie zelené s banánem', key: 'smoothie zelene s bananem' },
      { text: 'Vajíčka na měkko, žitný chléb', key: 'vajicka na mekko zitny chleb' },
      { text: 'Ovesná kaše s jablkem a skořicí', key: 'ovesna kase s jablkem a skoricí' },
    ],
    lunches_alt: [
      { text: 'Cizrna na paprice s rýží', key: 'cizrna na paprice s ryzi' },
      { text: 'Špenátový krém s vejcem a chlebem', key: 'spanatovy krem s vejcem a chlebem' },
      { text: 'Zeleninový kuskus s cizrnou', key: 'zeleninovy kuskus s cizrnou' },
      { text: 'Sýrový sendvič, zeleninový salát', key: 'syrovy sendvic zeleninovy salat' },
      { text: 'Lentilková polévka, pečivo', key: 'lentilkova polevka pecivo' },
      { text: 'Grilovaný sýr halloumi s bulgurem', key: 'grilovany syr halloumi s bulgurem' },
      { text: 'Těstoviny s brokolicí a parmezánem', key: 'testoviny s brokolici a parmezanem' },
    ],
    dinners_alt: [
      { text: 'Arašídové tofu s rýží', key: 'arasisove tofu s ryzi' },
      { text: 'Zeleninový lívance s jogurtem', key: 'zeleninovy livance s jogurtem' },
      { text: 'Fazolový guláš s chlebem', key: 'fazolovy gulas s chlebem' },
      { text: 'Pizza zeleninová (tenká base)', key: 'pizza zeleninova tenka base' },
      { text: 'Bramboráky s tvarohem', key: 'bramboraky s tvarohem' },
      { text: 'Zeleninový curry s cizrnou', key: 'zeleninovy curry s cizrnou' },
      { text: 'Pohanka s uzeným tofu a zelím', key: 'pohanka s uzenym tofu a zelim' },
    ],
  },
  vegan: {
    breakfasts: [
      { text: 'Ovesná kaše s ovocem a ořechy, čaj', key: 'ovesna kase s ovocem a orechy caj' },
      { text: 'Smoothie s banánem a špenátem, celozrnný toast', key: 'smoothie s bananem a spinatem celozrnny toast' },
      { text: 'Chia pudink s kokosovým mlékem a ovocem', key: 'chia pudink s kokosovym mlekem a ovocem' },
      { text: 'Jogurt rostlinný s müsli a borůvkami', key: 'jogurt rostlinny s musli a boruvkami' },
      { text: 'Palačinky z mandlové mouky s ovocem', key: 'palacinky z mandlove mouky s ovocem' },
      { text: 'Avokádový toast s rajčaty a pepřem', key: 'avokadovy toast s rajcaty a peprem' },
      { text: 'Ovesná kaše s jablkem a skořicí', key: 'ovesna kase s jablkem a skorici' },
    ],
    lunches: [
      { text: 'Čočka na kyselo, rýže, zeleninový salát', key: 'cocka na kyselo ryze zeleninovy salat' },
      { text: 'Tofu stir-fry s rýžovými nudlemi', key: 'tofu stir fry s ryzovymi nudlemi' },
      { text: 'Zeleninové curry s luštěninami a rýží', key: 'zeleninove curry s lusteninami a ryzi' },
      { text: 'Quinoa salát s cizrnou a avokádem', key: 'quinoa salat s cizrnou a avokadem' },
      { text: 'Falafel s tahini a zeleninou', key: 'falafel s tahini a zeleninou' },
      { text: 'Zeleninová polévka s cizrnou a chlebem', key: 'zeleninova polevka s cizrnou a chlebem' },
      { text: 'Bulgur s grilovanou zeleninou a hummusem', key: 'bulgur s grilovanou zeleninou a hummusem' },
    ],
    dinners: [
      { text: 'Tofu s quinoou a dušená zelenina', key: 'tofu s quinoou a dusena zelenina' },
      { text: 'Zeleninové curry s luštěninami', key: 'zeleninove curry s lusteninami' },
      { text: 'Pečená zelenina s cizrnou a rýží', key: 'pecena zelenina s cizrnou a ryzi' },
      { text: 'Červený salát s červenou řepou a ořechy', key: 'cerveny salat s cervenou repou a orechy' },
      { text: 'Zeleninové placky s jogurtem rostlinným', key: 'zeleninove placky s jogurtem rostlinnym' },
      { text: 'Těstoviny s rajčatovou omáčkou a bazalkou', key: 'testoviny s rajcatovou omackou a bazalkou' },
      { text: 'Dušená čočka s bramborami a zeleninou', key: 'dusena cocka s bramborami a zeleninou' },
    ],
    breakfasts_alt: [
      { text: 'Chia pudink s ovocem', key: 'chia pudink s ovocem' },
      { text: 'Ovesná kaše s mandlovým mlékem a ořechy', key: 'ovesna kase s mandlovym mlekem a orechy' },
      { text: 'Avokádový toast s rajčaty', key: 'avokadovy toast s rajcaty' },
      { text: 'Smoothie bowl s granolou', key: 'smoothie bowl s granolou' },
      { text: 'Pohanková kaše s banánem', key: 'pohankova kase s bananem' },
      { text: 'Jablková musli s rostlinným jogurtem', key: 'jablkova musli s rostlinnym jogurtem' },
      { text: 'Rostlinný jogurt s müsli a borůvkami', key: 'rostlinny jogurt s musli a boruvkami' },
    ],
    lunches_alt: [
      { text: 'Hummus wrap s zeleninou', key: 'hummus wrap s zeleninou' },
      { text: 'Falafel s tahini a salátem', key: 'falafel s tahini a salatem' },
      { text: 'Dýňová polévka s chlebem', key: 'dynova polevka s chlebem' },
      { text: 'Quinoa salát s fazolemi a avokádem', key: 'quinoa salat s fazolemi a avokadem' },
      { text: 'Zeleninový burger s batátovými hranolky', key: 'zeleninovy burger s batatovymi hranolky' },
      { text: 'Tempeh s rýží a zeleninou', key: 'tempeh s ryzi a zeleninou' },
      { text: 'Čočková polévka s celozrnným chlebem', key: 'cockova polevka s celozrnnym chlebem' },
    ],
    dinners_alt: [
      { text: 'Pečený květák s cizrnou a kurkumou', key: 'peceny kvetak s cizrnou a kurkumou' },
      { text: 'Zeleninové rizoto s nutritional yeast', key: 'zeleninove rizoto s nutritional yeast' },
      { text: 'Čočka dhal s rýží basmati', key: 'cocka dhal s ryzi basmati' },
      { text: 'Tofu scramble s zeleninou', key: 'tofu scramble s zeleninou' },
      { text: 'Cizrna na kari s rýží', key: 'cizrna na kari s ryzi' },
      { text: 'Zeleninový wok s rýžovými nudlemi', key: 'zeleninovy wok s ryzovymi nudlemi' },
      { text: 'Fazolový chilli s rýží', key: 'fazolovy chilli s ryzi' },
    ],
  },
};

/** Výběr indexu tréninkového bloku podle pořadí dne, cíle a kontextu – větší diverzita. */
function getTrainingBlockIndex(workoutDayCount, goal, activity, stress) {
  const n = TRAINING_BLOCKS.length;
  const redukceOffset = 2;
  const nabiraniOffset = 0;
  const defaultOffset = 1;
  const offset = goal === 'redukce' ? redukceOffset : goal === 'nabirani_svaly' ? nabiraniOffset : defaultOffset;
  return (workoutDayCount + offset + (stress ? 1 : 0)) % n;
}

/** Suplementace fallback: odvozená z goal, diet_type, activity, stress (ne pevná šablona). */
function buildSupplementNote(diet, goal, activity, stress) {
  const parts = [];
  if (diet === 'vegan') parts.push('B12, vitamin D, omega-3 z řas');
  else if (diet === 'vegetarian') parts.push('B12, vitamin D, železo');
  else parts.push('Vitamin D');
  if (goal === 'redukce') parts.push('udržuj hydrataci a elektrolyty');
  if (stress && (stress > 5 || String(stress).toLowerCase().includes('vysok'))) parts.push('magnézium, popř. adaptogeny pro regeneraci');
  if (activity && (activity > 4 || String(activity).toLowerCase().includes('vysok'))) parts.push('regenerace a dostatek bílkovin');
  return parts.length ? parts.join('. ') + '.' : 'Dle potřeby a cíle (D, B12 u veg/veg).';
}

/** Tréninkové bloky – střídání full body / lower+core / upper+core / cardio-mobilita. Každý má název, délku, rozcvičku, cviky (s canonical_key pro enrichment), závěr. */
const TRAINING_BLOCKS = [
  {
    title: 'Full body',
    duration: 45,
    warmup: 'Rozcvička 5–10 min: lehké kardio, dynamický strečink.',
    exercises: [
      { name: 'Dřepy: 3×10–12', key: 'drepy' },
      { name: 'Kliky: 3×8–10', key: 'kliky' },
      { name: 'Přítahy v předklonu (expandér nebo jednoručky): 3×10', key: 'pritahy v predklonu' },
      { name: 'Prkno: 3×30–45 s', key: 'prkno' },
      { name: 'Výpady: 3×10 na nohu', key: 'vypady' },
    ],
    coolDown: 'Strečink 5 min.',
  },
  {
    title: 'Dolní partie a core',
    duration: 40,
    warmup: 'Rozcvička 5–10 min: kroužení v kyčlích, dřepy bez zátěže.',
    exercises: [
      { name: 'Dřepy: 4×10', key: 'drepy' },
      { name: 'Výpady v chůzi: 3×8 na nohu', key: 'vypady' },
      { name: 'Zvedání pánve (most): 3×12', key: 'zvedani panve' },
      { name: 'Prkno: 3×30 s', key: 'prkno' },
      { name: 'Zkracovačky: 3×15', key: 'zkracovacky' },
    ],
    coolDown: 'Strečink stehen a hýždí 5 min.',
  },
  {
    title: 'Horní partie a core',
    duration: 40,
    warmup: 'Rozcvička 5–10 min: kroužení ramen, lehké kardio.',
    exercises: [
      { name: 'Kliky: 4×8–10', key: 'kliky' },
      { name: 'Přítahy: 3×10', key: 'pritahy v predklonu' },
      { name: 'Tlaky na ramena (jednoručky): 3×10', key: 'tlaky na ramena' },
      { name: 'Prkno: 3×30 s', key: 'prkno' },
      { name: 'Bicycle crunch: 3×12 na stranu', key: 'bicycle crunch' },
    ],
    coolDown: 'Strečink 5 min.',
  },
  {
    title: 'Kardio a mobilita',
    duration: 35,
    warmup: 'Rozcvička 5 min.',
    exercises: [
      { name: 'Běh na místě nebo skákání: 10 min', key: 'beh na miste' },
      { name: 'Dřepy: 2×15', key: 'drepy' },
      { name: 'Výpady: 2×10 na nohu', key: 'vypady' },
      { name: 'Dynamický strečink a mobilita: 10 min', key: 'strecink' },
    ],
    coolDown: 'Uvolnění a dech 5 min.',
  },
  {
    title: 'Tlaky a tahy + core',
    duration: 42,
    warmup: 'Rozcvička 5–10 min: kroužení ramen, lehké kardio.',
    exercises: [
      { name: 'Kliky: 3×10', key: 'kliky' },
      { name: 'Přítahy v předklonu: 3×10', key: 'pritahy v predklonu' },
      { name: 'Tlaky nad hlavu: 3×10', key: 'tlaky nad hlavu' },
      { name: 'Prkno: 3×30 s', key: 'prkno' },
      { name: 'Výpady: 2×10 na nohu', key: 'vypady' },
    ],
    coolDown: 'Strečink 5 min.',
  },
];

/**
 * Deterministic fallback plán když AI selže. Generuje platný HTML z bodyMetrics.
 * 7 různých snídaní/obědů/večeří podle dne, variabilní tréninkové bloky, meal_key a exercise_key pro enrichment.
 * @param {object} bodyMetrics - body_metrics
 * @param {Date|null} [targetStartDate] - první den plánu (pro sladění s valid_from)
 */
function buildDeterministicFallbackPlanHtml(bodyMetrics, targetStartDate = null) {
  const bm = bodyMetrics || {};
  const goal = (bm.goal || '').toLowerCase().trim();
  const weight = asNum(bm.weight_kg) || 70;
  const diet = normalizeDietTypeForGpt(bm.diet_type);
  const rotation = MEAL_ROTATION[diet] || MEAL_ROTATION.standard;
  const foodsToAvoid = (bm.foods_to_avoid || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const workoutDaysRaw = bm.workout_days;
  const workoutDaySet = new Set(
    Array.isArray(workoutDaysRaw)
      ? workoutDaysRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
      : String(workoutDaysRaw || '')
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
  );
  const dayIndex = (name) => {
    const i = CZECH_DAYS.findIndex((d) => d.toLowerCase() === (name || '').toLowerCase());
    return i >= 0 ? i : 0;
  };
  const isWorkoutDay = (dayName) => workoutDaySet.has(dayIndex(dayName));

  const refDate = targetStartDate || new Date();
  const todayIdx = refDate.getDay();
  const orderedDays = [...CZECH_DAYS.slice(todayIdx), ...CZECH_DAYS.slice(0, todayIdx)];

  const caloriesBase = goal === 'redukce' ? Math.round(weight * 28) - 300 : goal === 'nabirani_svaly' ? Math.round(weight * 32) + 200 : Math.round(weight * 30);
  const calories = Math.round(caloriesBase / 50) * 50;
  const protein = Math.round(weight * 1.8);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);

  const dietNote = diet === 'vegan' ? ' (veganské)' : diet === 'vegetarian' ? ' (vegetariánské)' : '';
  const hasGlutenRestriction = /lepk|gluten|bez.?lepku/i.test(bm.dietary_restrictions || '');
  const glutenWords = ['chleb', 'peciv', 'testovin', 'bulgur', 'kuskus', 'mouka', 'obiln', 'toast', 'gnocchi', 'wrap', 'tortilla'];
  const pickMeal = (arr, arrAlt, dayIdx) => {
    const useAlt = goal === 'redukce' ? dayIdx % 2 === 1 : goal === 'nabirani_svaly' ? dayIdx % 2 === 0 : (dayIdx + (bm.stress ? 1 : 0)) % 2 === 0;
    const base = (arrAlt && useAlt ? arrAlt : arr) || arr;
    let item = base[dayIdx % base.length];
    const avoid = (item.text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    if (foodsToAvoid.length && foodsToAvoid.some((a) => avoid.includes(a))) {
      item = base[(dayIdx + 1) % base.length] || item;
    }
    if (hasGlutenRestriction && glutenWords.some((g) => avoid.includes(g))) {
      for (let k = 1; k < base.length; k++) {
        const alt = base[(dayIdx + k) % base.length];
        const altNorm = (alt.text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
        if (!glutenWords.some((g) => altNorm.includes(g))) return alt;
      }
    }
    return item;
  };

  let workoutDayCount = 0;
  let daysHtml = '';
  for (let i = 0; i < orderedDays.length; i++) {
    const dayName = orderedDays[i];
    const bf = pickMeal(rotation.breakfasts, rotation.breakfasts_alt, i);
    const lu = pickMeal(rotation.lunches, rotation.lunches_alt, i);
    const di = pickMeal(rotation.dinners, rotation.dinners_alt, i);

    let trainBlock;
    if (isWorkoutDay(dayName)) {
      const blockIndex = getTrainingBlockIndex(workoutDayCount, goal, bm.activity, bm.stress);
      const block = TRAINING_BLOCKS[blockIndex % TRAINING_BLOCKS.length];
      workoutDayCount += 1;
      const duration = goal === 'redukce' ? Math.min(block.duration, 45) : goal === 'nabirani_svaly' ? Math.min(block.duration + 5, 55) : block.duration;
      trainBlock = `<p><b>Trénink tento den:</b></p><ul><li>Trénink celkem: ${duration} min – ${block.title}.</li><li>${block.warmup}</li>${block.exercises.map((ex) => `<li data-exercise-key="${(ex.key || '').replace(/"/g, '&quot;')}">${ex.name}</li>`).join('')}<li>Závěr: ${block.coolDown}</li></ul>`;
    } else {
      trainBlock = '<p><b>Trénink tento den:</b></p><ul><li>Odpočinek.</li></ul>';
    }

    daysHtml += `
<h3>${dayName}</h3>
<p data-meal-key="${(bf.key || normalizedMealKey(bf.text)).replace(/"/g, '&quot;')}"><b>Snídaně:</b> ${bf.text}${dietNote}</p>
<p data-meal-key="${(lu.key || normalizedMealKey(lu.text)).replace(/"/g, '&quot;')}"><b>Oběd:</b> ${lu.text}</p>
<p data-meal-key="${(di.key || normalizedMealKey(di.text)).replace(/"/g, '&quot;')}"><b>Večeře:</b> ${di.text}</p>
${trainBlock}
`;
  }

  const restrictions = [bm.dietary_restrictions, bm.foods_to_avoid].filter(Boolean).join('. ');
  const supplementNote = buildSupplementNote(diet, goal, bm.activity, bm.stress);

  let out = `<h2>Tvůj plán na tento týden</h2>
<h3>Jídelníček</h3>
${daysHtml.trim()}
<h3>Trénink</h3>
<p><b>Progrese a bezpečnost:</b> Postupně zvyšuj zátěž. Dýchej pravidelně. Po tréninku zapiš zápis v aplikaci.</p>
<h3>Regenerace</h3>
<p>Spánek 7–8 h, strečink po tréninku, pitný režim.</p>
<h3>Suplementace</h3>
<p>${supplementNote}</p>
<h3>Nákupní seznam</h3>
<ul><li>Ovesné vločky</li><li>Ovoce (banány, jablka)</li><li>Rýže, quinoa</li><li>Zelenina (listová, kořenová)</li><li>${diet === 'vegan' ? 'Tofu, luštěniny' : diet === 'vegetarian' ? 'Luštěniny, vejce, sýr' : 'Drůbež nebo ryby'}</li></ul>
<h3>Mindset na tento týden</h3>
<p>${goal === 'redukce' ? 'Soustřeď se na pravidelnost a lehčí porce – každý krok se počítá.' : goal === 'nabirani_svaly' ? 'Důslednost v jídle i tréninku – plné porce a kvalitní bílkoviny.' : 'Každý malý krok se počítá. Sleduj pokrok v aplikaci.'}</p>
${restrictions ? `<!-- Respektováno: ${restrictions} -->` : ''}`.trim();
  const MIN_SAFE_PLAN_LENGTH = 3500;
  if (out.length < MIN_SAFE_PLAN_LENGTH) {
    out += '\n<!-- ' + ' padding '.repeat(Math.ceil((MIN_SAFE_PLAN_LENGTH - out.length - 12) / 10)) + ' -->';
  }
  return out;
}

/** Položky, u kterých nepřidáváme data-exercise-key (nemají canonical cvik). */
const TRAINING_SKIP_LI_PREFIXES = ['odpočinek', 'lehká procházka', 'trénink celkem'];

/**
 * Do HTML plánu doplní data-exercise-key u <li> v blocích „Trénink tento den“, pokud tam chybí.
 * Rozcvička → warmup, Závěr → cooldown, aby enrichment mohl vrátit médium.
 */
function injectExerciseKeysIntoPlanHtml(html) {
  if (!html || typeof html !== 'string') return html;
  return html.replace(
    /<p[^>]*>\s*<b[^>]*>\s*Trénink tento den[^<]*<\/b>\s*<\/p>\s*<ul([^>]*)>([\s\S]*?)<\/ul>/gi,
    (block) => {
      return block.replace(/<ul([^>]*)>([\s\S]*?)<\/ul>/i, (_, ulAttrs, ulInner) => {
        const newUlInner = ulInner.replace(/<li([^>]*)>([\s\S]*?)<\/li>/gi, (liMatch, liAttrs, liContent) => {
          if (/data-exercise-key\s*=/i.test(liAttrs)) return liMatch;
          const text = liContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const lower = text.toLowerCase();
          if (TRAINING_SKIP_LI_PREFIXES.some((p) => lower.startsWith(p))) return liMatch;
          let key = null;
          if (lower.startsWith('rozcvička') || lower.startsWith('rozcvicka')) key = 'warmup';
          else if (lower.startsWith('závěr') || lower.startsWith('zaver')) key = 'cooldown';
          else {
            const name = text.split(':')[0].trim().slice(0, 80);
            if (!name || name.length < 2) return liMatch;
            key = resolveToCanonicalKey(name) || normalizeExerciseLookupKey(name);
          }
          if (!key) return liMatch;
          const safeKey = key.replace(/"/g, '&quot;');
          return `<li${liAttrs} data-exercise-key="${safeKey}">${liContent}</li>`;
        });
        return `<ul${ulAttrs}>${newUlInner}</ul>`;
      });
    }
  );
}

/** Minimální délka textu v sekci Trénink (znaky bez HTML), pod kterou doplníme výchozí blok. Krátká sekce (jen progrese/bezpečnost) je OK – detail je u každého dne. */
const TRAINING_SECTION_MIN_LENGTH = 80;

/**
 * Výchozí tréninkový blok od „trenéra“ – rozcvička, struktura, příklady, progrese, bezpečnost.
 * Použije se, když AI vrátí jen jednu větu nebo sekci chybí.
 */
const DEFAULT_TRAINING_HTML = `
<p><b>Doporučená frekvence a dny:</b> 3× týdně (např. Po, St, Pá) – silový nebo kombinovaný trénink 45–60 min. Můžeš přizpůsobit dny podle svého rozvrhu.</p>
<p><b>Rozcvička (5–10 min):</b> Lehké kardio (běh na místě, skákání přes švihadlo nebo orbitrek) 3–5 min. Následuje dynamický strečink – kroužení rameny, kyčle, výpady v chůzi, dřepy bez zátěže. Cíl: prohřát svaly a klouby, snížit riziko zranění.</p>
<p><b>Hlavní část (45–60 min):</b> Zaměř se na komplexní cviky – dřepy, výpady, kliky, přítahy (tělo nebo expander), tlaky na ramena, core (prkno, zvedání nohou). Začátečníci: 2–3 série po 10–12 opakováních, 1–2 min pauza. Středně pokročilí: 3–4 série, 8–12 opakování, postupně přidávej zátěž.</p>
<p><b>Závěr – strečink (5 min):</b> Statický strečink hlavních svalových skupin (stehna, hýždě, záda, ramena) – každá pozice 20–30 s. Podporuje regeneraci a flexibilitu.</p>
<p><b>Progrese a bezpečnost:</b> Každý týden můžeš mírně zvýšit zátěž, počet sérií nebo opakování. Dýchej pravidelně (výdech při námaze), neposouvej se přes bolest – kvalita před kvantitou. Po tréninku zapiš zápis v aplikaci (typ, délka), aby se ti přepočítal odhad váhy a pokrok.</p>
`.trim();

/**
 * Vrátí obsah sekce Trénink z HTML (text mezi <h3>Trénink</h3> a dalším <h3>).
 */
function getTrainingSectionContent(html) {
  if (!html || typeof html !== 'string') return '';
  const match = html.match(/<h3[^>]*>[^<]*(?:Trénink|treninkový plán)[^<]*<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/i);
  if (!match || !match[1]) return '';
  return (match[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pokud je sekce Trénink příliš krátká nebo chybí, doplní nebo nahradí výchozím rozvinutým blokem.
 */
function enrichTrainingSection(html) {
  if (!html || typeof html !== 'string') return html;
  const content = getTrainingSectionContent(html);
  if (content.length >= TRAINING_SECTION_MIN_LENGTH) return html;

  const trainingHeading = /<h3[^>]*>[^<]*(?:Trénink|Tréninkový plán)[^<]*<\/h3>/i;
  const replacement = `<h3>Trénink</h3>\n${DEFAULT_TRAINING_HTML}`;
  if (trainingHeading.test(html)) {
    return html.replace(
      /<h3[^>]*>[^<]*(?:Trénink|Tréninkový plán)[^<]*<\/h3>[\s\S]*?(?=<h3[^>]*>|$)/i,
      replacement
    );
  }
  // Sekce Trénink chybí – vložit před Regenerace nebo Suplementace nebo na konec před Mindset
  const beforeRegen = html.match(/([\s\S]*?)(<h3[^>]*>[^<]*Regenerace[^<]*<\/h3>)/i);
  if (beforeRegen) return beforeRegen[1] + replacement + '\n\n' + beforeRegen[2] + (html.slice(html.indexOf(beforeRegen[2]) + beforeRegen[2].length));
  const beforeSup = html.match(/([\s\S]*?)(<h3[^>]*>[^<]*Suplementace[^<]*<\/h3>)/i);
  if (beforeSup) return beforeSup[1] + replacement + '\n\n' + beforeSup[2] + (html.slice(html.indexOf(beforeSup[2]) + beforeSup[2].length));
  const beforeMindset = html.match(/([\s\S]*?)(<h3[^>]*>[^<]*Mindset[^<]*<\/h3>)/i);
  if (beforeMindset) return beforeMindset[1] + replacement + '\n\n' + beforeMindset[2] + (html.slice(html.indexOf(beforeMindset[2]) + beforeMindset[2].length));
  return html + '\n\n' + replacement;
}

/**
 * Z HTML plánu vyextrahuje blok „Trénink tento den“ pro každý den v pořadí, v jakém se v plánu vyskytují.
 * @param {string} planHtml
 * @returns {{ dayName: string, trainingHtml: string }[]}
 */
function extractTrainingBlocksByDay(planHtml) {
  if (!planHtml || typeof planHtml !== 'string') return [];
  const blocks = [];
  const dayPattern = CZECH_DAYS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const dayRe = new RegExp(`<h[34][^>]*>\\s*(${dayPattern})\\s*</h[34]>([\\s\\S]*?)(?=<h[34][^>]*>|$)`, 'gi');
  let m;
  while ((m = dayRe.exec(planHtml)) !== null) {
    const dayName = m[1];
    const dayContent = m[2];
    const trainMatch = dayContent.match(/<p[^>]*>\s*<b[^>]*>\s*Trénink tento den:?\s*<\/b>\s*<\/p>\s*<ul[^>]*>[\s\S]*?<\/ul>/i);
    const trainingHtml = trainMatch ? trainMatch[0] : '<p><b>Trénink tento den:</b></p><ul><li>Odpočinek.</li></ul>';
    blocks.push({ dayName, trainingHtml });
  }
  return blocks;
}

/**
 * Vrátí { from, until, startDate } pro příští plán navazující na aktuální.
 * Další jídelníček pokračuje od posledního dne (valid_until) – např. plán do 12.3 → další od 12.3.
 * @param {string} validUntilStr - valid_until aktuálního plánu (YYYY-MM-DD)
 * @returns {{ from: string, until: string, startDate: Date }}
 */
function getNextPlanRangeFromCurrentPlan(validUntilStr) {
  if (!validUntilStr || typeof validUntilStr !== 'string') return getNextWeekRange();
  const lastDay = new Date(validUntilStr.trim() + 'T12:00:00');
  if (isNaN(lastDay.getTime())) return getNextWeekRange();
  const firstDay = new Date(lastDay);
  const lastDayNext = new Date(firstDay);
  lastDayNext.setDate(firstDay.getDate() + 6);
  return {
    from: firstDay.toISOString().split('T')[0],
    until: lastDayNext.toISOString().split('T')[0],
    startDate: firstDay,
  };
}

/**
 * Vrátí { from, until } pro příští týden (pondělí–neděle). Fallback když nemáme aktuální plán.
 */
function getNextWeekRange() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilNextMonday = dow === 0 ? 1 : dow === 1 ? 7 : (8 - dow) % 7;
  const nextMon = new Date(now);
  nextMon.setDate(now.getDate() + daysUntilNextMonday);
  const nextSun = new Date(nextMon);
  nextSun.setDate(nextMon.getDate() + 6);
  return {
    from: nextMon.toISOString().split('T')[0],
    until: nextSun.toISOString().split('T')[0],
    startDate: nextMon,
  };
}

/**
 * Sestaví prompt pro přegenerování pouze jídelníčku při zachování stávajícího tréninkového rozvrhu.
 * @param {object} bm - body_metrics
 * @param {{ dayName: string, trainingHtml: string }[]} trainingBlocksInOrder - bloky v pořadí z plánu
 * @param {string[]} [pinnedMeals] - označená jídla pro zahrnutí
 * @param {Date} [targetStartDate] - první den týdne (pro příští týden = pondělí)
 */
function buildMealsOnlyPrompt(bm, trainingBlocksInOrder, pinnedMeals = [], targetStartDate = null) {
  const preferences = buildPreferencesForGpt(bm.diet_type, bm.dietary_restrictions, bm.foods_to_avoid, bm.notes);
  const refDate = targetStartDate || new Date();
  const todayIdx = refDate.getDay();
  const orderedDays = [...CZECH_DAYS.slice(todayIdx), ...CZECH_DAYS.slice(0, todayIdx)];
  const startDay = orderedDays[0];
  const defaultBlock = '<p><b>Trénink tento den:</b></p><ul><li>Odpočinek.</li></ul>';
  const blockByDay = {};
  for (const b of trainingBlocksInOrder) blockByDay[b.dayName] = b.trainingHtml;
  const trainingSpec = orderedDays
    .map((dayName) => `Den ${dayName}: ${blockByDay[dayName] || defaultBlock}`)
    .join('\n\n');
  let pinnedBlock = '';
  if (Array.isArray(pinnedMeals) && pinnedMeals.length > 0) {
    pinnedBlock = `\n\nUživatel si označil tato jídla pro zahrnutí do plánu. POVINNĚ je zakomponuj do jídelníčku na vhodné dny a časy (snídaně jako snídaně, oběd jako oběd, večeře jako večeře). Můžeš je mírně upravit (porce, příloha), ale název/charakter jídla zachovej.\nOznačená jídla: ${pinnedMeals.join('; ')}`;
  }
  return `Změna POUZE stravovacích preferencí. NEMĚŇ rozvrh tréninků – u každého dne musí zůstat blok „Trénink tento den“ PŘESNĚ jak níže.

JÍDLA: Pouze běžná, dohledatelná jídla (Spoonacular lookup). Žádná kreativní exotika.

Nové preference (respektuj v jídelníčku): ${preferences || 'žádné'}

Vygeneruj POUZE jídelníček (Snídaně, Oběd, Večeře) pro 7 dní v tomto pořadí: ${orderedDays.join(', ')}. Začni od "${startDay}".
U každého dne POVINNĚ uveď blok „Trénink tento den“ PŘESNĚ (zkopíruj beze změny) z odpovídajícího řádku níže – NEPŘEGENEROVÁVEJ tréninky, NEMĚŇ které dny jsou odpočinek a které trénink.

Tréninkové bloky k zachování (v pořadí dnů):
${trainingSpec}

Vrať platný JSON: {"ok":true,"metrics":{...},"html":"..."}. V html ponech i sekce Regenerace, Suplementace, Nákupní seznam, Mindset – můžeš je zkrátit nebo ponechat obecně. Hlavní je nový jídelníček a ZACHOVANÉ tréninkové bloky u každého dne.${pinnedBlock}`;
}

function buildAutonomyTaskBlock(taskContext = null) {
  if (!taskContext || typeof taskContext !== 'object') return '';
  const taskType = taskContext.task_type || null;
  const reason = taskContext.reason || null;
  const prompt = taskContext.prompt || null;
  const sharedFact = taskContext.shared_fact || null;
  const eventType = taskContext.event_context?.event_type || null;
  const eventPayload = taskContext.event_context?.payload || null;

  const lines = [];
  if (taskType) lines.push(`TASK_TYPE: ${taskType}`);
  if (reason) lines.push(`DŮVOD ÚKOLU: ${reason}`);
  if (prompt) lines.push(`ZADÁNÍ ÚKOLU: ${prompt}`);
  if (sharedFact) lines.push(`DŮLEŽITÝ FAKT Z PAMĚTI: ${sharedFact}`);
  if (eventType) lines.push(`ZDROJOVÁ UDÁLOST: ${eventType}`);
  if (eventPayload) lines.push(`EVENT PAYLOAD: ${JSON.stringify(eventPayload)}`);

  if (taskType === 'adjust_plan') {
    lines.push('CÍL TÉTO AKCE: neuvažuj to jako nový generický plán. Uprav stávající plán tak, aby reagoval na stagnaci, zachoval strukturu a zlepšil proveditelnost.');
  } else if (taskType === 'reduce_training_load') {
    lines.push('CÍL TÉTO AKCE: sniž tréninkový objem a náročnost, přidej větší důraz na regeneraci a udrž plán realistický pro vyšší stres.');
  } else if (taskType === 'weekly_plan_update') {
    lines.push('CÍL TÉTO AKCE: vytvoř navazující další týden, ne první plán od nuly. Zachovej kontinuitu, ale obměň jídla a trénink.');
  } else if (taskType === 'initial_plan') {
    lines.push('CÍL TÉTO AKCE: vytvoř první plnohodnotný plán pro nového uživatele.');
  }

  if (lines.length === 0) return '';
  return `\n\nAUTONOMNÍ KONTEXT ÚKOLU:\n${lines.join('\n')}`;
}

function buildUserPrompt(bm, pinnedMeals = [], targetStartDate = null, taskContext = null) {
  const hasDietColumns = bm.diet_type != null || bm.dietary_restrictions != null || bm.foods_to_avoid != null;
  let diet_type = 'standard';
  let preferences = '';
  if (hasDietColumns) {
    diet_type = normalizeDietTypeForGpt(bm.diet_type);
    preferences = buildPreferencesForGpt(bm.diet_type, bm.dietary_restrictions, bm.foods_to_avoid, bm.notes);
  } else if (bm.notes) {
    const parsed = parseDietFromNotes(bm.notes);
    diet_type = parsed.diet_type ? normalizeDietTypeForGpt(parsed.diet_type) : 'standard';
    preferences = parsed.preferences;
  }

  // Sestavit pořadí 7 dnů začínající od ref. dne (targetStartDate = příští týden)
  const refDate = targetStartDate || new Date();
  const todayIdx = refDate.getDay(); // 0=Sun, 1=Mon, ...
  const orderedDays = [...CZECH_DAYS.slice(todayIdx), ...CZECH_DAYS.slice(0, todayIdx)];
  const startDay = orderedDays[0];

  const rawFreq = bm.freq_choice ?? bm.frequency ?? bm.weekly_sessions;
  const weeklySessionsNum = (() => {
    if (rawFreq == null) return '—';
    const n = Number(rawFreq);
    if (Number.isFinite(n) && [1, 3, 5].includes(n)) return n;
    const t = String(rawFreq).toLowerCase();
    if (t.includes('1')) return 1;
    if (t.includes('4') || t.includes('5')) return 5;
    return 3;
  })();

  const rawWorkoutDays = bm.workout_days;
  const workoutDaysArr = rawWorkoutDays != null && rawWorkoutDays !== ''
    ? (Array.isArray(rawWorkoutDays)
        ? rawWorkoutDays.map((x) => Number(x))
        : String(rawWorkoutDays).split(',').map((s) => Number(s.trim())))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
    : [];
  const input = {
    name: bm.name ?? '—',
    gender: bm.gender ?? '—',
    age: bm.age ?? '—',
    height_cm: bm.height_cm ?? bm.height ?? '—',
    weight_kg: bm.weight_kg ?? bm.weight ?? '—',
    activity: bm.activity ?? '—',
    stress: bm.stress_level ?? bm.stress ?? '—',
    occupation: bm.occupation ?? '—',
    goal: bm.goal ?? '—',
    weekly_sessions: weeklySessionsNum,
    diet_type: diet_type,
    preferences: preferences || '—',
    workout_days: workoutDaysArr.length > 0 ? workoutDaysArr : undefined,
  };
  let pinnedBlock = '';
  if (Array.isArray(pinnedMeals) && pinnedMeals.length > 0) {
    pinnedBlock = `\n\nUživatel si označil tato jídla pro zahrnutí do plánu. POVINNĚ je zakomponuj do jídelníčku na vhodné dny a časy (snídaně jako snídaně, oběd jako oběd, večeře jako večeře). Můžeš je mírně upravit (porce, příloha), ale název/charakter jídla zachovej.\nOznačená jídla: ${pinnedMeals.join('; ')}`;
  }
  let workoutDaysBlock = '';
  if (workoutDaysArr.length > 0) {
    const dayNames = [...new Set(workoutDaysArr)].map((i) => CZECH_DAYS[i]).filter(Boolean);
    if (dayNames.length > 0) {
      workoutDaysBlock = `\n\nTRÉNINKOVÉ DNY (pouze tyto dny mají trénink – u ostatních dnů uveď jeden bod „Odpočinek.“ nebo „Lehká procházka 20–30 min.“): ${dayNames.join(', ')}. Rozlož tréninkový objem pouze na tyto dny.`;
    }
  }
  return `VSTUP (JSON): ${JSON.stringify(input)}

DŮLEŽITÉ: NEPŘIJATELNÉ je vrátit pouze sekce Regenerace, Suplementace nebo Mindset bez kompletního Jídelníčku a Tréninku. Takový výstup NENÍ hotový plán a bude zamítnut.

POVINNÉ POŽADAVKY NA HTML VÝSTUP – MUSÍ být splněny:
1) Sekce <h3>Jídelníček</h3> – hlavní nadpis jídelníčku
2) Sekce <h3>Trénink</h3> – hlavní nadpis tréninku
3) 7 dní v pořadí: ${orderedDays.join(', ')} – začni od "${startDay}"
4) U každého dne POVINNĚ Snídaně, Oběd, Večeře (konkrétní jídla)
5) U každého dne blok „Trénink tento den“: <p><b>Trénink tento den:</b></p><ul><li>…</li></ul>

Vygeneruj kompletní plán jako JSON podle struktury. Respektuj diet_type a preferences. Jídelníček: 7 dní, 3 jídla denně – POVINNĚ začni od dne "${startDay}" a pokračuj v tomto pořadí: ${orderedDays.join(', ')}. U každého dne pod Snídaně/Oběd/Večeře POVINNĚ uveď „Trénink tento den“ v bodech (<p><b>Trénink tento den:</b></p><ul><li>…</li></ul>): u tréninkových dnů přizpůsob délku a objem klientovi (goal, weekly_sessions, activity, stress). První bod „Trénink celkem: X min (přizpůsobeno cíli a frekvenci)“, rozcvička a závěr vždy s délkou v minutách, každý cvik ve formátu „Název: sérií×opakování – cca X min (provedení)“; redukce = 30–45 min, nabírání = 40–55 min, udržování = 35–50 min; 1–2× týdně = 35–45 min. U dnů bez tréninku jeden bod „Odpočinek.“ nebo „Lehká procházka 20–30 min.“ Sekce <h3>Trénink</h3> pak jen krátce: progrese a bezpečnost (dýchání, zapsat v aplikaci). Suplementace povinně dle diet_type. Nákupní seznam a Mindset na tento týden musí být v html.${workoutDaysBlock}${pinnedBlock}${buildAutonomyTaskBlock(taskContext)}`;
}

/**
 * DEPRECATED: Thin wrapper nad runUnifiedPlanPipeline.
 * Zachovává zpětnou kompatibilitu pro volající očekávající { html, metrics, enrichment }.
 */
async function generatePlan(params = {}) {
  const bm = {
    name: params.name ?? null,
    gender: params.gender ?? null,
    age: params.age ?? null,
    height_cm: params.height_cm ?? null,
    weight_kg: params.weight_kg ?? null,
    activity: params.activity ?? null,
    stress_level: params.stress ?? params.stress_level ?? null,
    occupation: params.occupation ?? null,
    goal: params.goal ?? null,
    freq_choice: params.freq_choice ?? params.weekly_sessions ?? null,
    weekly_sessions: params.weekly_sessions ?? null,
    workout_days: params.workout_days ?? null,
    diet_type: params.diet_type ?? null,
    dietary_restrictions: params.dietary_restrictions ?? null,
    foods_to_avoid: params.foods_to_avoid ?? null,
    notes: params.notes ?? null,
    user_id: params.user_id ?? null,
  };
  const { runUnifiedPlanPipeline } = await import('./unifiedPlanPipeline');
  const result = await runUnifiedPlanPipeline({ bm, useOpenAI: true });
  if (!result?.ok) {
    throw new Error(result?.error ?? 'Plan generation failed');
  }
  const targets = result.targets ?? result.planJson?.targets ?? {};
  const metrics = {
    ...bm,
    calories: Number(targets.calories_per_day) || 2200,
    protein_g: Number(targets.protein_g) || 120,
    carbs_g: Number(targets.carbs_g) || 220,
    fat_g: Number(targets.fat_g) || 65,
  };
  const days = result.planJson?.days ?? [];
  const meals = days.flatMap((d) => (d.meals ?? []).map((m) => m.recipe ?? { title: m.display_name })).filter(Boolean);
  const exercises = days.flatMap((d) => d.workout?.exercises ?? []);
  return {
    html: result.planHtml ?? '',
    metrics,
    enrichment: { meals, exercises },
    generation_source: result.generation_source ?? 'openai',
    fallback_used: result.generation_source === 'fallback',
  };
}

// Legacy generatePlan body removed – generatePlan is now thin wrapper over runUnifiedPlanPipeline.
async function _removedLegacyGeneratePlanBody() {
  // Dead code – never called. Kept for reference during migration.
  if (false) {
  let parsed = null;
  if (parsed && parsed.ok && typeof parsed.html === 'string') {
    raw_ai_html_length = parsed.html.length;
    html = sanitizeHtmlFromJson(parsed.html);
    html = enrichTrainingSection(html);
    html = injectExerciseKeysIntoPlanHtml(html);
    if (parsed.metrics && typeof parsed.metrics === 'object') {
      const m = parsed.metrics;
      metricsOut = {
        ...bm,
        bmr: asNum(m.bmr),
        tdee: asNum(m.tdee),
        calories: asNum(m.calories) ? Math.round(asNum(m.calories) / 50) * 50 : undefined,
        protein_g: asNum(m.protein_g),
        carbs_g: asNum(m.carbs_g),
        fat_g: asNum(m.fat_g),
      };
    }
  } else {
    const extracted = extractHtmlFromAiOutput(rawContent);
    raw_ai_html_length = extracted ? extracted.length : 0;
    html = enrichTrainingSection(extracted || '');
    html = injectExerciseKeysIntoPlanHtml(html);
  }

  let firstValid = validatePublishedPlanHtml(html || '');
  if (!firstValid.ok) {
    generation_source = 'ai_retry';
    const missingLabel = (firstValid.missingCoreSections || []).join(', ') || firstValid.reason;
    const strictRetryPrompt = `PŘEDCHOZÍ VÝSTUP NEBYL PLATNÝ (chybí: ${missingLabel}). Vygeneruj znovu podle ZADÁNÍ níže – vrať POUZE validní JSON s polem html. Html MUSÍ obsahovat kompletní jídelníček a kompletní tréninkový plán (sekce Jídelníček, Trénink, 7 dní se Snídaně/Oběd/Večeře, u každého dne „Trénink tento den“). Výstup bez Jídelníčku a Tréninku je zamítnut. Žádné vysvětlování mimo JSON.\n\n--- ZADÁNÍ ---\n${userPrompt}`;
    const { rawContent: retryRaw } = await runAssistantWithPrompt(strictRetryPrompt, threadId, bm.user_id || null);
    parsed = extractJsonFromAiOutput(retryRaw);
    if (parsed && parsed.ok && typeof parsed.html === 'string') {
      html = sanitizeHtmlFromJson(parsed.html);
      html = enrichTrainingSection(html);
      html = injectExerciseKeysIntoPlanHtml(html);
      if (parsed.metrics && typeof parsed.metrics === 'object') {
        const m = parsed.metrics;
        metricsOut = { ...bm, bmr: asNum(m.bmr), tdee: asNum(m.tdee), calories: asNum(m.calories) ? Math.round(asNum(m.calories) / 50) * 50 : undefined, protein_g: asNum(m.protein_g), carbs_g: asNum(m.carbs_g), fat_g: asNum(m.fat_g) };
      }
    } else {
      const fallbackHtml = extractHtmlFromAiOutput(retryRaw);
      if (fallbackHtml) {
        html = enrichTrainingSection(fallbackHtml);
        html = injectExerciseKeysIntoPlanHtml(html);
      }
    }
  }

  const needsRetryDiet = (dietTypeForCheck === 'vegetarian' || dietTypeForCheck === 'vegan') && planViolatesDiet(html, dietTypeForCheck);
  const needsRetryGluten = planViolatesGlutenFree(html, preferencesForCheck);

  if (needsRetryDiet || needsRetryGluten) {
    const reasons = [];
    if (needsRetryDiet) reasons.push(`diet_type ${dietTypeForCheck}`);
    if (needsRetryGluten) reasons.push('Bez lepku');
    const retryMessage = `Kontrola: V předchozím výstupu byly zakázané položky. Přegeneruj CELÝ plán jako JSON. ${reasons.map((r) => `Respektuj: ${r}.`).join(' ')}`;
    try {
      const { rawContent: retryRaw } = await runAssistantWithPrompt(retryMessage, threadId, bm.user_id || null);
      if (retryRaw) {
        const retryParsed = extractJsonFromAiOutput(retryRaw);
        const retryHtml = retryParsed?.html ? sanitizeHtmlFromJson(retryParsed.html) : extractHtmlFromAiOutput(retryRaw);
        if (!planViolatesDiet(retryHtml, dietTypeForCheck) && !planViolatesGlutenFree(retryHtml, preferencesForCheck)) {
          html = enrichTrainingSection(retryHtml);
          if (retryParsed?.metrics) metricsOut = { ...metricsOut, ...retryParsed.metrics };
        }
      }
    } catch (e) {
      console.warn('⚠️ Retry asistenta (diet/lepku) selhal:', e.message);
    }
  }

  let planValid = validatePublishedPlanHtml(html || '');
  if (!planValid.ok) {
    const fallbackHtml = buildDeterministicFallbackPlanHtml(bm, targetStartDate);
    const fallbackValid = validatePublishedPlanHtml(fallbackHtml);
    if (fallbackValid.ok) {
      html = fallbackHtml;
      planValid = fallbackValid;
      generation_source = 'deterministic_fallback';
      fallback_used = true;
      console.info('[generatePlan] deterministic fallback used – AI output invalid', { reason: planValid.reason });
    } else {
      console.error('[generatePlan] validation failed and deterministic fallback invalid', {
        ai_reason: planValid.reason,
        fallback_reason: fallbackValid.reason,
        fallback_structure: fallbackValid.structure,
      });
      throw new Error('Generated plan is incomplete and deterministic fallback failed');
    }
  }

  // Optional enrichment: meal images/nutrition and exercise GIFs from external APIs.
  let enrichment = { meals: [], exercises: [] };
  try {
    const enriched = await enrichPlanContent({ html });
    enrichment = { meals: enriched.meals || [], exercises: enriched.exercises || [] };
  } catch (e) {
    console.warn('⚠️ Enrichment (meals/exercises) failed:', e?.message);
  }

  // Truth check: hard gate (unpublishable) + soft gate (repetitive, unjustified supplements)
  let truth_retry_triggered = false;
  let truth_retry_reason = null;
  let truth_retry_fixed = null;

  const truthCheck = validatePlanTruth(html, enrichment);

  // Hard gate: nepublikovatelná jídla/cviky → 1 retry, pak fallback
  if (!truthCheck.truth_check_passed) {
    truth_retry_triggered = true;
    truth_retry_reason = truthCheck.truth_check_reason;
    console.warn('[generatePlan] truth_check failed – unpublishable entities', {
      unpublishable_meals: truthCheck.unpublishable_meals,
      unpublishable_exercises: truthCheck.unpublishable_exercises,
    });
    const retryPrompt = `PŘEDCHOZÍ PLÁN OBSAHUJE NEPUBLIKOVATELNÉ POLOŽKY. Přegeneruj plán jako JSON.
Nahraď tyto jídla běžnými, dohledatelnými: ${(truthCheck.unpublishable_meals || []).slice(0, 5).join(', ') || '—'}.
Nahraď tyto cviky pouze z povoleného seznamu (Dřepy, Kliky, Přítahy v předklonu, Výpady, Prkno, Superman, Mrtvý tah, Rumunský mrtvý tah, Tlaky na hrudník, Rozcvička, Závěr, Strečink, Odpočinek, Lehká procházka): ${(truthCheck.unpublishable_exercises || []).slice(0, 5).join(', ') || '—'}.
Žádné libovolné názvy. Pouze ověřitelné entity.\n\n--- ZADÁNÍ ---\n${userPrompt}`;
    try {
      const { rawContent: retryRaw } = await runAssistantWithPrompt(retryPrompt, null, bm.user_id || null);
      const retryParsed = extractJsonFromAiOutput(retryRaw);
      const retryHtmlRaw = retryParsed?.html ? sanitizeHtmlFromJson(retryParsed.html) : extractHtmlFromAiOutput(retryRaw);
      const retryHtml = retryHtmlRaw ? enrichTrainingSection(injectExerciseKeysIntoPlanHtml(retryHtmlRaw)) : '';
      if (retryHtml && validatePublishedPlanHtml(retryHtml).ok) {
        const retryEnriched = await enrichPlanContent({ html: retryHtml }).catch(() => ({ meals: [], exercises: [] }));
        const retryTruth = validatePlanTruth(retryHtml, retryEnriched);
        truth_retry_fixed = retryTruth.truth_check_passed;
        if (retryTruth.truth_check_passed) {
          html = retryHtml;
          if (retryParsed?.metrics) {
            const m = retryParsed.metrics;
            metricsOut = { ...bm, bmr: asNum(m.bmr), tdee: asNum(m.tdee), calories: asNum(m.calories) ? Math.round(asNum(m.calories) / 50) * 50 : undefined, protein_g: asNum(m.protein_g), carbs_g: asNum(m.carbs_g), fat_g: asNum(m.fat_g) };
          }
          enrichment = { meals: retryEnriched.meals || [], exercises: retryEnriched.exercises || [] };
          generation_source = 'ai_retry_truth';
        } else {
          html = buildDeterministicFallbackPlanHtml(bm, targetStartDate);
          enrichment = { meals: [], exercises: [] };
          try {
            const fallbackEnriched = await enrichPlanContent({ html });
            enrichment = { meals: fallbackEnriched.meals || [], exercises: fallbackEnriched.exercises || [] };
          } catch {}
          generation_source = 'deterministic_fallback';
          fallback_used = true;
        }
      } else {
        html = buildDeterministicFallbackPlanHtml(bm, targetStartDate);
        enrichment = { meals: [], exercises: [] };
        try {
          const fallbackEnriched = await enrichPlanContent({ html });
          enrichment = { meals: fallbackEnriched.meals || [], exercises: fallbackEnriched.exercises || [] };
        } catch {}
        generation_source = 'deterministic_fallback';
        fallback_used = true;
      }
    } catch (e) {
      console.warn('[generatePlan] truth retry failed, using deterministic fallback:', e?.message);
      html = buildDeterministicFallbackPlanHtml(bm, targetStartDate);
      enrichment = { meals: [], exercises: [] };
      try {
        const fallbackEnriched = await enrichPlanContent({ html });
        enrichment = { meals: fallbackEnriched.meals || [], exercises: fallbackEnriched.exercises || [] };
      } catch {}
      generation_source = 'deterministic_fallback';
      fallback_used = true;
    }
  } else if (!truthCheck.soft_gate_passed) {
    // Soft gate: repetitivní jídelníček/trénink nebo šablonovitá suplementace → 1 retry s přesným důvodem
    truth_retry_triggered = true;
    truth_retry_reason = truthCheck.soft_gate_reason;
    console.warn('[generatePlan] soft_gate failed – diversity/supplement quality', {
      repetitive_meals: truthCheck.repetitive_meals,
      repetitive_training_days: truthCheck.repetitive_training_days,
      unjustified_supplements: truthCheck.unjustified_supplements,
    });
    const softRetryParts = [];
    if (truthCheck.repetitive_meals?.length) {
      softRetryParts.push(`JÍDELNÍČEK: Stejné jídlo se opakuje příliš často (${truthCheck.repetitive_meals.slice(0, 5).join(', ')}). Variuj snídaně, obědy i večeře – max 2× za týden stejné jídlo ve stejném slotu.`);
    }
    if (truthCheck.repetitive_training_days?.length) {
      softRetryParts.push(`TRÉNINK: Dny ${truthCheck.repetitive_training_days.join(', ')} mají identický blok cviků. Každý tréninkový den musí být rozeznatelně jiný (full body / dolní / horní / kardio-mobilita).`);
    }
    if (truthCheck.unjustified_supplements?.length) {
      softRetryParts.push(`SUPLEMENTACE: Text je příliš generický. Napiš konkrétní doporučení podle goal, diet_type, activity a stresu – co, proč, kdy. Ne krátkou šablonu.`);
    }
    const weakFlags = truthCheck.weak_quality_flags || [];
    if (weakFlags.includes('weak_meal_detail')) {
      softRetryParts.push(`JÍDELNÍČEK: Musí být 21 konkrétních jídel (7 dní × 3). Každé jídlo min. 6 znaků – konkrétní název s přílohou, ne jednoslovné.`);
    }
    if (weakFlags.includes('weak_training_detail')) {
      softRetryParts.push(`TRÉNINK: U každého tréninkového dne min. 3 hlavní cviky (kromě rozcvičky/závěru). Konkrétní cviky s sériemi a opakováními.`);
    }
    if (weakFlags.includes('weak_regeneration_detail')) {
      softRetryParts.push(`REGENERACE: Min. 2–3 věty (spánek, strečink, pitný režim), ne jedna krátká věta.`);
    }
    if (weakFlags.includes('weak_mindset_detail')) {
      softRetryParts.push(`MINDSET: Min. jednu větu přizpůsobenou cíli, ne prázdné ani jednoslovné.`);
    }
    if (weakFlags.includes('weak_shopping_list')) {
      softRetryParts.push(`NÁKUPNÍ SEZNAM: Konkrétní položky odpovídající jídlům v plánu (zelenina, bílkoviny, přílohy), min. 5 položek.`);
    }
    const softRetryPrompt = `KVALITA PLÁNU: Následující problémy musíš odstranit. Přegeneruj plán jako JSON.\n\n${softRetryParts.join('\n\n')}\n\n--- ZADÁNÍ ---\n${userPrompt}`;
    try {
      const { rawContent: softRaw } = await runAssistantWithPrompt(softRetryPrompt, null, bm.user_id || null);
      const softParsed = extractJsonFromAiOutput(softRaw);
      const softHtmlRaw = softParsed?.html ? sanitizeHtmlFromJson(softParsed.html) : extractHtmlFromAiOutput(softRaw);
      const softHtml = softHtmlRaw ? enrichTrainingSection(injectExerciseKeysIntoPlanHtml(softHtmlRaw)) : '';
      if (softHtml && validatePublishedPlanHtml(softHtml).ok) {
        const softEnriched = await enrichPlanContent({ html: softHtml }).catch(() => ({ meals: [], exercises: [] }));
        const softTruth = validatePlanTruth(softHtml, softEnriched);
        truth_retry_fixed = softTruth.truth_check_passed && softTruth.soft_gate_passed;
        if (softTruth.truth_check_passed && softTruth.soft_gate_passed) {
          html = softHtml;
          if (softParsed?.metrics) {
            const m = softParsed.metrics;
            metricsOut = { ...bm, bmr: asNum(m.bmr), tdee: asNum(m.tdee), calories: asNum(m.calories) ? Math.round(asNum(m.calories) / 50) * 50 : undefined, protein_g: asNum(m.protein_g), carbs_g: asNum(m.carbs_g), fat_g: asNum(m.fat_g) };
          }
          enrichment = { meals: softEnriched.meals || [], exercises: softEnriched.exercises || [] };
          generation_source = 'ai_retry_truth';
        } else {
          html = buildDeterministicFallbackPlanHtml(bm, targetStartDate);
          enrichment = { meals: [], exercises: [] };
          try {
            const fallbackEnriched = await enrichPlanContent({ html });
            enrichment = { meals: fallbackEnriched.meals || [], exercises: fallbackEnriched.exercises || [] };
          } catch {}
          generation_source = 'deterministic_fallback';
          fallback_used = true;
        }
      } else {
        html = buildDeterministicFallbackPlanHtml(bm, targetStartDate);
        enrichment = { meals: [], exercises: [] };
        try {
          const fallbackEnriched = await enrichPlanContent({ html });
          enrichment = { meals: fallbackEnriched.meals || [], exercises: fallbackEnriched.exercises || [] };
        } catch {}
        generation_source = 'deterministic_fallback';
        fallback_used = true;
      }
    } catch (e) {
      console.warn('[generatePlan] soft gate retry failed, using deterministic fallback:', e?.message);
      html = buildDeterministicFallbackPlanHtml(bm, targetStartDate);
      enrichment = { meals: [], exercises: [] };
      try {
        const fallbackEnriched = await enrichPlanContent({ html });
        enrichment = { meals: fallbackEnriched.meals || [], exercises: fallbackEnriched.exercises || [] };
      } catch {}
      generation_source = 'deterministic_fallback';
      fallback_used = true;
    }
  }

  const finalTruthCheck = validatePlanTruth(html, enrichment);
  const final_html_length = (html || '').length;
  const media_exact_count = (finalTruthCheck.meals_exact_count ?? 0) + (finalTruthCheck.exercises_exact_count ?? 0);
  const media_none_count = (finalTruthCheck.meals_none_count ?? 0) + (finalTruthCheck.exercises_none_count ?? 0);

  return {
    html,
    metrics: metricsOut,
    enrichment,
    generation_source,
    fallback_used,
    truth_check: finalTruthCheck,
    truth_retry_triggered: truth_retry_triggered || undefined,
    truth_retry_reason: truth_retry_reason ?? undefined,
    truth_retry_fixed: truth_retry_fixed ?? undefined,
    final_publish_source: generation_source,
    raw_ai_html_length: raw_ai_html_length ?? undefined,
    final_html_length,
    ai_output_was_used: generation_source === 'ai',
    retry_output_was_used: generation_source === 'ai_retry_truth',
    fallback_output_was_used: generation_source === 'deterministic_fallback',
    weak_quality_flags: finalTruthCheck.weak_quality_flags ?? undefined,
    media_exact_count,
    media_none_count,
    prompt_source: agentConfig?.prompt_source ?? undefined,
    prompt_version: agentConfig?.prompt_version ?? undefined,
    supporting_documents_count: supportingDocs?.length ?? 0,
    document_titles: supportingDocs?.map((d) => d.title).filter(Boolean) ?? [],
    source_ids: supportingDocs?.map((d) => d.source_id).filter(Boolean) ?? [],
  };
  }
}

/** Odstraní nebezpečné tagy z HTML z JSON (script, style, iframe). */
function sanitizeHtmlFromJson(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .trim();
}

/**
 * Vygeneruje AI plán pro daný e-mail a odešle ho.
 * THIN WRAPPER: deleguje na unified pipeline (generatePlanForEmailViaUnified).
 * @param {string} email - E-mail uživatele (musí mít záznam v body_metrics)
 * @param {object} [options] - Volby pro e-mail (loginPassword, loginUrl, existingAccount, loginUnavailable, validFromOverride, validUntilOverride, skipEmail, mealsOnly, planChangeContext)
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
async function generatePlanForEmail(email, options = {}) {
  try {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new Error('OPENAI_API_KEY chybí v env. Nastav v Vercel → Settings → Environment Variables.');
    }
    console.info('[generatePlan] generatePlanForEmail → unified pipeline');
    const { generatePlanForEmailViaUnified } = await import('./unifiedPlanPipeline');
    return generatePlanForEmailViaUnified(email, {
      bmOverride: options.bmOverride,
      validFromOverride: options.validFromOverride,
      validUntilOverride: options.validUntilOverride,
      skipEmail: options.skipEmail,
      mealsOnly: options.mealsOnly,
      planChangeContext: options.planChangeContext,
      loginPassword: options.loginPassword,
      loginUrl: options.loginUrl,
      existingAccount: options.existingAccount,
      loginUnavailable: options.loginUnavailable,
      userChosePassword: options.userChosePassword,
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('❌ generatePlanForEmail ERROR:', msg, err?.stack);
    return { ok: false, message: msg };
  }
}

/**
 * Vygeneruje plán z parametrů (např. z assistant-intake) a odešle e-mailem.
 * @param {object} params - { name, email, gender, age, height, weight, activity, stress, workType, goal, frequency, notes }
 * @param {object} [options] - Volby pro e-mail (loginUrl, existingAccount)
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
async function generatePlanAndSendFromParams(params, options = {}) {
  if (!params?.email) return { ok: false, message: 'Chybí e-mail.' };
  const freq = params.weekly_sessions ?? params.frequency ?? params.freq_choice;
  const bm = {
    name: params.name ?? null,
    gender: params.gender ?? null,
    age: params.age ?? null,
    height_cm: params.height_cm ?? params.height ?? null,
    weight_kg: params.weight_kg ?? params.weight ?? null,
    activity: params.activity ?? null,
    stress_level: params.stress ?? params.stress_level ?? null,
    occupation: params.workType ?? params.occupation ?? null,
    goal: params.goal ?? null,
    freq_choice: typeof freq === 'string' ? freq : (freq != null ? String(freq) : null),
    weekly_sessions_user: typeof freq === 'number' ? freq : (freq != null ? parseInt(freq, 10) : null),
    diet_type: params.diet_type ?? null,
    dietary_restrictions: params.dietary_restrictions ?? params.preferences ?? null,
    foods_to_avoid: params.foods_to_avoid ?? null,
    notes: params.notes ?? null,
    user_id: params.user_id ?? null,
  };
  return generatePlanForEmail(params.email, { ...options, bmOverride: bm });
}

export { generatePlan, generatePlanForEmail, generatePlanAndSendFromParams, getNextWeekRange, getNextPlanRangeFromCurrentPlan, buildDeterministicFallbackPlanHtml };
