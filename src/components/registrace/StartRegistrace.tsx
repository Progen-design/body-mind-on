import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  getStep1FieldErrors,
  getStep2FieldErrors,
  getStep2FieldBlurError
} from '@lib/registration/registrationStepValidation.js';
import { getFrequencyDayRange } from '@lib/preferenceConstants.js';
import { REGISTRATION_STEPS } from '@lib/registrationRules.js';
import { TRAINING_ENVIRONMENT_OPTIONS, EQUIPMENT_OPTIONS } from '@lib/trainingEnvironment.js';
import { startProgramEnvironment } from '@lib/workoutStartProgram.js';
import { TreninkovaOmezeni } from './TreninkovaOmezeni.tsx';
import { supabase } from '@lib/supabaseClient.js';
import { EMAIL_TAKEN_MESSAGE_CS } from '@lib/registration/checkEmailAvailableClient.js';
import { hlaskaEmailu } from '@lib/registration/kontrolaEmailu.js';
// Stejný zdroj jako TrialPaywallCard a lifecycle e-maily — jediné místo
// pravdy pro cenu a délku trialu (lib/pricingConstants.js). Ceny se sem
// nepíšou natvrdo, ať appka a checkout nikdy nemají jiné číslo.
// `START_VARIANT_PRICE_LABEL` je formát se stejnými mezerami kolem lomítka,
// jaké má web ("599 Kč / měsíc") — bod 8.7 chce text doslova z webu.
import { TRIAL_DAYS, START_VARIANT_PRICE_LABEL } from '@lib/pricing';
import { ODKAZ_PODMINKY, ODKAZ_GDPR } from '@lib/pravniOdkazy.js';
// Z konstant, ne z '@lib/souhlasy.js' — ten importuje supabaseServer a natáhl
// by serverový modul do klientského bundlu. Viz lib/souhlasyKonstanty.js.
import { DRUHY_SOUHLASU } from '@lib/souhlasyKonstanty.js';
import { useKontrolaEmailu } from '../../hooks/useKontrolaEmailu';
import { normalizujKod } from '@lib/poukazy.js';
import { Krokovac, Pole, Vicenasobny, Vyber, Popisek, Chyba } from './prvky';
import { AKTIVITA, CIL, CHYTRA_VAHA, DIETA, DNY, FREKVENCE, KROKY, POHLAVI, STRES, TYP_PRACE } from './volby';

type Formular = {
  name: string; email: string; password: string; passwordConfirm: string;
  gender: string; birth_date: string; height: string; weight: string;
  smart_scale_choice: string; activity: string; stress: string; worktype: string;
  goal: string; frequency: string; workout_days: number[];
  training_environment: string; training_environment_detail: string;
  available_equipment: string[]; diet_type: string; dietary_restrictions: string;
  foods_to_avoid: string; notes: string; program: string; devices: string[];
  // Vyloučení cviků a pohybových vzorů — RAW hodnoty pro
  // training_exclusions (viz lib/trainingExclusions.js), stejný princip
  // jako foods_to_avoid: dvě samostatná pole, server je spojí do jednoho
  // sloupce (stejně jako training_environment + available_equipment).
  training_exclusion_patterns: string[]; training_exclusion_muscles: string[];
};

const PRAZDNY: Formular = {
  name: '', email: '', password: '', passwordConfirm: '',
  gender: '', birth_date: '', height: '', weight: '',
  smart_scale_choice: 'none', activity: '', stress: '', worktype: '',
  goal: '', frequency: '', workout_days: [],
  training_environment: '', training_environment_detail: '',
  available_equipment: [], diet_type: '', dietary_restrictions: '',
  foods_to_avoid: '', notes: '', program: 'START', devices: [],
  training_exclusion_patterns: [], training_exclusion_muscles: []
};

interface Props {
  onHotovo: (kam: string) => void;
  onZpetNaPrihlaseni: () => void;
}

type StavPoukazu =
  | { stav: 'nic' }
  | { stav: 'overuji' }
  | { stav: 'platny'; dny: number }
  | { stav: 'neplatny'; hlaska: string };

/** Kód z QR na poukazu: /start?kod=ABCD-EFGH-IJKL. */
function kodZUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('kod')?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * Ověření kódu poukazu už při psaní (jen ověření, nic nezapisuje — uplatní
 * se až při založení účtu). Ptá se jen na kód v platném tvaru, s krátkou
 * prodlevou, ať se neposílá dotaz na každé písmeno.
 */
function useKontrolaPoukazu(vstup: string): StavPoukazu {
  const [stav, setStav] = useState<StavPoukazu>({ stav: 'nic' });

  useEffect(() => {
    if (!vstup.trim()) { setStav({ stav: 'nic' }); return undefined; }
    const kod = normalizujKod(vstup);
    if (!kod) {
      setStav(vstup.replace(/[\s-]/g, '').length >= 12
        ? { stav: 'neplatny', hlaska: 'Tohle nevypadá jako kód poukazu (má tvar XXXX-XXXX-XXXX).' }
        : { stav: 'nic' });
      return undefined;
    }

    let zruseno = false;
    setStav({ stav: 'overuji' });
    const casovac = window.setTimeout(async () => {
      try {
        const odpoved = await fetch('/api/registration/voucher-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kod }),
        });
        const telo = await odpoved.json().catch(() => ({}));
        if (zruseno) return;
        setStav(telo?.platny
          ? { stav: 'platny', dny: Number(telo.dny) || 30 }
          : { stav: 'neplatny', hlaska: String(telo?.hlaska || 'Poukaz se nepodařilo ověřit.') });
      } catch {
        if (!zruseno) setStav({ stav: 'neplatny', hlaska: 'Poukaz se teď nepodařilo ověřit. Zkusíme ho uplatnit při založení účtu.' });
      }
    }, 450);
    return () => { zruseno = true; window.clearTimeout(casovac); };
  }, [vstup]);

  return stav;
}

export const StartRegistrace: React.FC<Props> = ({ onHotovo, onZpetNaPrihlaseni }) => {
  const [krok, setKrok] = useState(1);
  const [data, setData] = useState<Formular>(PRAZDNY);
  const [chyby, setChyby] = useState<Record<string, string>>({});
  const [stav, setStav] = useState<{ typ: 'chyba' | 'ok'; text: string } | null>(null);
  const [odesilam, setOdesilam] = useState(false);
  const [overuji, setOveruji] = useState(false);
  // SOUHLAS SE ZAHÁJENÍM PLNĚNÍ A SE ZPRACOVÁNÍM ZDRAVOTNÍCH ÚDAJŮ.
  //
  // Dvě věci, jedno zaškrtnutí, protože obojí je podmínka téhož kroku:
  // bez souhlasu se zahájením plnění před uplynutím 14denní lhůty se nesmí
  // začít generovat plán (§ 1837 obč. zák., bod 10 obchodních podmínek),
  // a tělesné složení, spánek a tep jsou zvláštní kategorie podle čl. 9
  // GDPR, kterou nepokryje „plnění smlouvy" — potřebuje VÝSLOVNÝ souhlas.
  // Do teď se nesbíral ani jeden.
  const [souhlas, setSouhlas] = useState(false);

  // POUKAZ (volitelný). QR na fyzickém poukazu vede na /start?kod=… — kód se
  // předvyplní. Neplatný kód registraci nezastaví, jen se nepoužije.
  const [kodPoukazu, setKodPoukazu] = useState(kodZUrl);
  const poukaz = useKontrolaPoukazu(kodPoukazu);
  const dniZdarma = poukaz.stav === 'platny' ? poukaz.dny : TRIAL_DAYS;

  // Dostupnost e-mailu se hlida uz pri psani. Klik na „Dal" jde pres tutez
  // kontrolu (`overEmailHned`), takze starsi odpoved nikdy neprepise novejsi.
  const { stav: stavEmailu, overHned: overEmailHned } = useKontrolaEmailu(data.email);
  // Pod polem je vzdy NEJVYS JEDNA hlaska — rozhoduje lib/registration/kontrolaEmailu.js.
  const hlaskaPoleEmail = hlaskaEmailu({ stav: stavEmailu, chybaPole: chyby.email || null });
  const uctExistuje = hlaskaPoleEmail?.text === EMAIL_TAKEN_MESSAGE_CS;

  // Nova odpoved kontroly nahrazuje starou hlasku: zastarale „uz je
  // registrovany" v chybach pole (od serveru nebo pozdni odpovedi) se smaze,
  // jakmile kontrola rekne neco noveho.
  useEffect(() => {
    if (stavEmailu === 'necinny') return;
    setChyby((c) => {
      if (c.email !== EMAIL_TAKEN_MESSAGE_CS) return c;
      const { email: _, ...zbytek } = c;
      return zbytek;
    });
  }, [stavEmailu]);

  const zmen = <K extends keyof Formular>(klic: K, hodnota: Formular[K]) => {
    setData((d) => ({ ...d, [klic]: hodnota }));
    setChyby((c) => {
      if (!c[klic as string]) return c;
      const { [klic as string]: _, ...zbytek } = c;
      return zbytek;
    });
  };

  const maxDnu = useMemo(() => getFrequencyDayRange(data.frequency).max as number, [data.frequency]);

  // NÁVYKY SE TU UŽ NEVYBÍRAJÍ (9. 9. 2026). Výběr byl povinný, přestože
  // stejný seznam je v profilu nepovinný, a stál na posledním kroku před
  // založením účtu. Od 21. 9. 2026 se návyky nezakládají vůbec
  // (záložka Návyky zmizela, web je neslibuje).

  // Text pod tlačítkem prosí „Nezavírej prosím stránku." — samotná prosba
  // ale odchod nezastaví. Zavření karty uprostřed generování nechá účet
  // založený a bez plánu, proto se přidává nativní potvrzení prohlížeče.
  useEffect(() => {
    if (!odesilam) return undefined;
    const varuj = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', varuj);
    return () => window.removeEventListener('beforeunload', varuj);
  }, [odesilam]);

  /** Validace kroku. Kroky 1 a 2 pouzivaji stejnou logiku jako API - jedna pravda. */
  const chybyKroku = (k: number): Record<string, string> => {
    if (k === 1) return getStep1FieldErrors(data) as Record<string, string>;
    if (k === 2) return getStep2FieldErrors(data) as Record<string, string>;
    if (k === 3) {
      const e: Record<string, string> = {};
      if (!data.activity) e.activity = 'Vyber úroveň aktivity.';
      if (!data.stress) e.stress = 'Vyber úroveň stresu.';
      if (!data.worktype) e.worktype = 'Vyber typ zaměstnání.';
      if (!data.goal) e.goal = 'Vyber svůj cíl.';
      if (!data.frequency) e.frequency = 'Vyber, jak často chceš trénovat.';
      if (!data.training_environment) e.training_environment = 'Vyber, kde budeš cvičit.';
      if (data.training_environment === 'other' && !data.training_environment_detail.trim()) {
        e.training_environment_detail = 'Popiš, kde budeš cvičit.';
      }
      if (data.workout_days.length < 1) e.workout_days = 'Vyber alespoň jeden tréninkový den.';
      return e;
    }
    if (k === 5) {
      const e: Record<string, string> = {};
      // Bez tohohle by šlo účet založit i bez souhlasu — a plán se generuje
      // hned po odeslání, tedy uvnitř lhůty pro odstoupení.
      if (!souhlas) e.souhlas = 'Bez souhlasu ti plán nemůžeme začít připravovat.';
      return e;
    }
    return {};
  };

  const dal = async () => {
    const e = chybyKroku(krok);
    if (Object.keys(e).length > 0) {
      setChyby((c) => ({ ...c, ...e }));
      return;
    }

    // Dostupnost e-mailu uz zna useKontrolaEmailu z psani. Znovu se pta jen
    // tehdy, kdyz vysledek jeste nemame (napr. vlozeni schranky a hned klik) —
    // a pres tutez kontrolu, ne vlastnim dotazem: odpoved na starsi e-mail se
    // tak nikdy nezapise k novemu. Hlasku „obsazeny" ukaze stav kontroly.
    if (krok === 1) {
      if (uctExistuje) return;
      if (stavEmailu !== 'volny') {
        setOveruji(true);
        const novy = await overEmailHned(data.email);
        setOveruji(false);
        // null = e-mail se mezitim zmenil a bezi novejsi kontrola — zustat.
        if (novy === null || novy === 'obsazeny') return;
      }
    }

    setStav(null);
    setKrok((k) => Math.min(k + 1, REGISTRATION_STEPS as number));
  };

  const zpet = () => {
    setStav(null);
    if (krok === 1) onZpetNaPrihlaseni();
    else setKrok((k) => k - 1);
  };

  /** Chybu z API vratime na krok, kde se da opravit - jinak uzivatel netusi kam sahnout. */
  const zpracujChybuApi = (zprava: string) => {
    if (/Výška musí být/i.test(zprava)) { setChyby({ height: zprava }); setKrok(2); return true; }
    if (/Váha musí být/i.test(zprava)) { setChyby({ weight: zprava }); setKrok(2); return true; }
    if (/Věk musí být|datum narození/i.test(zprava)) { setChyby({ birth_date: zprava }); setKrok(2); return true; }
    // Heslo odmítnuté serverem (krátké/slabé) patří k poli Heslo v kroku 1.
    if (/^Heslo musí mít|heslo je příliš slabé/i.test(zprava)) { setChyby({ password: zprava }); setKrok(1); return true; }
    // Shoda na vyznamu, ne na presnem zneni. Predchozi vzor hledal "e-mail už",
    // jenze API pise "e-mailem už existuje" - uzivatel pak zustal na kroku 5
    // s chybou o poli, ktere je o ctyri kroky zpatky.
    if (/už existuje|už je registrovan|nelze opakovat|already (registered|exists)/i.test(zprava)) {
      setChyby({ email: EMAIL_TAKEN_MESSAGE_CS });
      setKrok(1);
      // Kontrola z psani muze mit jeste stary stav „volny" — obnovit ji, ať
      // pod polem nesviti „volny" proti tomu, co prave rekl server.
      void overEmailHned(data.email);
      return true;
    }
    return false;
  };

  const odeslat = async () => {
    if (odesilam) return;
    for (const k of [1, 2, 3, 5]) {
      const e = chybyKroku(k);
      if (Object.keys(e).length > 0) { setChyby(e); setKrok(k); return; }
    }

    setOdesilam(true);
    setStav(null);

    try {
      const odpoved = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `selected_habits` se neposílá — návyky se nezakládají (21. 9. 2026).
        //
        // `souhlasy`: explicitní pole druhů (ze sdíleného DRUHY_SOUHLASU,
        // ne holé `true`) — ze serveru je pak vidět, S ČÍM přesně člověk
        // souhlasil, ne jen že něco odklikl. `souhlas` výš je jedno
        // zaškrtnutí pro oba druhy najednou (viz komentář u stavu),
        // takže se posílají oba, nebo žádný — nikdy podmnožina.
        body: JSON.stringify({
          ...data,
          souhlasy: souhlas ? DRUHY_SOUHLASU : [],
          // Kód poukazu jde jen, když není zjevně neplatný. Server ho uplatní
          // atomicky; když mezitím přestal platit, registrace proběhne s 7 dny.
          ...(kodPoukazu.trim() && poukaz.stav !== 'neplatny' ? { kod_poukazu: kodPoukazu.trim() } : {})
        })
      });

      const text = await odpoved.text();
      const vysledek = text ? JSON.parse(text) : {};

      if (odpoved.ok && (vysledek.plan_state === 'ready' || vysledek.plan_state === 'processing')) {
        const poznamkaPoukazu = vysledek.poukaz?.uplatnen
          ? ` Poukaz uplatněn — máš ${vysledek.poukaz.dny} dní zdarma.`
          : vysledek.poukaz?.hlaska ? ` ${vysledek.poukaz.hlaska} Máš běžných ${TRIAL_DAYS} dní zdarma.` : '';
        setStav({ typ: 'ok', text: (vysledek.message || 'Účet je vytvořený. Otevírám tvůj plán…') + poznamkaPoukazu });
        // Prihlasime rovnou, at uzivatel nemusi psat heslo podruhe.
        const { data: prihlaseni } = await supabase.auth.signInWithPassword({
          email: data.email.trim().toLowerCase(),
          password: data.password
        });
        if (prihlaseni?.session) onHotovo('/profil');
        else onHotovo(`/login?registered=1&email=${encodeURIComponent(data.email)}`);
        return;
      }

      setOdesilam(false);

      if (odpoved.ok) {
        setStav({
          typ: 'chyba',
          text: vysledek.message ||
            'Údaje jsme uložili, ale e-mail s plánem se nepodařilo odeslat. Zkus se přihlásit, plán může být už v profilu.'
        });
        return;
      }

      const zprava = odpoved.status === 504
        ? 'Generování plánu trvalo dlouho. Účet mohl vzniknout — zkus se přihlásit, plán může být už v profilu.'
        : (vysledek.error || vysledek.message || 'Registraci se nepodařilo dokončit.');

      if (!zpracujChybuApi(String(zprava))) setStav({ typ: 'chyba', text: String(zprava) });
    } catch (err) {
      setOdesilam(false);
      const m = (err as Error)?.message || '';
      setStav({
        typ: 'chyba',
        text: /timeout|504/i.test(m)
          ? 'Generování plánu trvalo dlouho. Zkus se přihlásit — plán může být už v profilu.'
          : 'Chyba připojení. Zkus to prosím za chvíli znovu.'
      });
    }
  };

  const prepniDen = (den: number) => {
    const je = data.workout_days.includes(den);
    if (je) zmen('workout_days', data.workout_days.filter((d) => d !== den));
    else if (data.workout_days.length < maxDnu) {
      zmen('workout_days', [...data.workout_days, den].sort((a, b) => a - b));
    }
  };

  /**
   * PODMÍNKA TRIALU JE VIDĚT OD PRVNÍHO KROKU.
   *
   * Text stál jen v kroku 5, těsně před založením účtu — člověk vyplnil
   * čtyři obrazovky a teprve pak se dozvěděl, že po sedmi dnech se platí.
   * Věta je doslova stejná jako v kroku 5, aby si dvě místa nemohla
   * odporovat.
   */
  const podminkaTrialu = (
    <p className="text-xs text-slate-400">
      {dniZdarma} dní zdarma{poukaz.stav === 'platny' ? ' (poukaz)' : ''}, pak {START_VARIANT_PRICE_LABEL}. První platba{' '}
      {dniZdarma + 1}. den. Zrušit můžeš kdykoli v profilu.
    </p>
  );

  const krok1 = (
    <div className="space-y-4">
      <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800">
        {podminkaTrialu}
      </div>
      <Pole id="name" popisek="Jméno" value={data.name} chyba={chyby.name}
        autoComplete="name" placeholder="Jak ti máme říkat"
        onChange={(e) => zmen('name', e.target.value)} />
      <div>
        <Pole id="email" popisek="E-mail" type="email" value={data.email}
          chyba={hlaskaPoleEmail?.typ === 'chyba' ? hlaskaPoleEmail.text : null}
          autoComplete="email" placeholder="tvuj@email.cz"
          onChange={(e) => zmen('email', e.target.value)} />
        {hlaskaPoleEmail?.typ === 'overuji' && (
          <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> {hlaskaPoleEmail.text}
          </p>
        )}
        {hlaskaPoleEmail?.typ === 'ok' && (
          <p className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1.5">
            <Check className="w-3 h-3" /> {hlaskaPoleEmail.text}
          </p>
        )}
        {hlaskaPoleEmail?.typ === 'varovani' && (
          <p className="mt-1.5 text-[11px] text-amber-400">{hlaskaPoleEmail.text}</p>
        )}
      </div>
      <Pole id="password" popisek="Heslo" type="password" value={data.password} chyba={chyby.password}
        autoComplete="new-password" placeholder="Aspoň 10 znaků"
        onChange={(e) => zmen('password', e.target.value)} />
      <Pole id="passwordConfirm" popisek="Heslo znovu" type="password" value={data.passwordConfirm}
        chyba={chyby.passwordConfirm} autoComplete="new-password" placeholder="Pro kontrolu"
        onChange={(e) => zmen('passwordConfirm', e.target.value)} />

      {/* Slepá ulička: účet existuje. Nabídneme rovnou cestu ven, ne jen chybu. */}
      {uctExistuje && (
        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-cyan-500/30">
          <p className="text-xs text-slate-300 mb-2.5">
            Na tenhle e-mail už účet máš. Registraci opakovat nejde — přihlas se.
          </p>
          <button
            type="button"
            onClick={onZpetNaPrihlaseni}
            className="w-full py-2.5 rounded-xl bg-akcent-lime text-na-akcentu font-bold text-xs"
          >
            Přejít na přihlášení
          </button>
        </div>
      )}
    </div>
  );

  const krok2 = (
    <div className="space-y-5">
      <Vyber popisek="Pohlaví" id="gender" hodnota={data.gender} volby={POHLAVI}
        chyba={chyby.gender} onZmena={(v) => zmen('gender', v)} />
      <Pole id="birth_date" popisek="Datum narození" type="date" value={data.birth_date}
        chyba={chyby.birth_date}
        onBlur={(e) => {
          const err = getStep2FieldBlurError('birth_date', e.target.value);
          if (err) setChyby((c) => ({ ...c, birth_date: err as string }));
        }}
        onChange={(e) => zmen('birth_date', e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Pole id="height" popisek="Výška (cm)" type="number" inputMode="numeric" value={data.height}
          chyba={chyby.height} placeholder="178" onChange={(e) => zmen('height', e.target.value)} />
        <Pole id="weight" popisek="Váha (kg)" type="number" inputMode="decimal" value={data.weight}
          chyba={chyby.weight} placeholder="82" onChange={(e) => zmen('weight', e.target.value)} />
      </div>
      <Vyber popisek="Chytrá váha" id="smart_scale_choice" hodnota={data.smart_scale_choice}
        volby={CHYTRA_VAHA} volitelne onZmena={(v) => zmen('smart_scale_choice', v)} />
    </div>
  );

  const krok3 = (
    <div className="space-y-5">
      <Vyber popisek="Pohybová aktivita" id="activity" hodnota={data.activity} volby={AKTIVITA}
        chyba={chyby.activity} onZmena={(v) => zmen('activity', v)} />
      <Vyber popisek="Úroveň stresu" id="stress" hodnota={data.stress} volby={STRES}
        chyba={chyby.stress} onZmena={(v) => zmen('stress', v)} />
      <Vyber popisek="Typ zaměstnání" id="worktype" hodnota={data.worktype} volby={TYP_PRACE}
        chyba={chyby.worktype} onZmena={(v) => zmen('worktype', v)} />
      <Vyber popisek="Cíl" id="goal" hodnota={data.goal} volby={CIL}
        chyba={chyby.goal} onZmena={(v) => zmen('goal', v)} />
      <Vyber popisek="Jak často chceš trénovat" id="frequency" hodnota={data.frequency} volby={FREKVENCE}
        chyba={chyby.frequency}
        onZmena={(v) => {
          const max = getFrequencyDayRange(v).max as number;
          setData((d) => ({ ...d, frequency: v, workout_days: d.workout_days.slice(0, max) }));
          setChyby((c) => ({ ...c, frequency: '', workout_days: '' }));
        }} />

      <div>
        <Popisek>Tréninkové dny</Popisek>
        <p className="text-[11px] text-slate-500 mb-2 -mt-0.5">
          {data.frequency
            ? `Vyber až ${maxDnu} ${maxDnu === 1 ? 'den' : maxDnu < 5 ? 'dny' : 'dní'}. Ostatní dny budou odpočinek nebo lehká procházka.`
            : 'Nejdřív vyber frekvenci tréninků.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {DNY.map(({ hodnota, label }) => {
            const vybrano = data.workout_days.includes(hodnota);
            const plno = !vybrano && data.workout_days.length >= maxDnu;
            return (
              <button key={hodnota} type="button" aria-pressed={vybrano}
                disabled={!data.frequency || plno} onClick={() => prepniDen(hodnota)}
                className={`w-12 h-12 rounded-2xl border text-xs font-semibold transition-all active:scale-95 disabled:opacity-35 ${
                  vybrano
                    ? 'bg-akcent-lime/15 border-akcent-lime/60 text-akcent-lime'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                {label}
              </button>
            );
          })}
        </div>
        <Chyba text={chyby.workout_days} />
      </div>

      <Vyber popisek="Kde budeš cvičit" id="training_environment" hodnota={data.training_environment}
        volby={TRAINING_ENVIRONMENT_OPTIONS as any} chyba={chyby.training_environment}
        onZmena={(v) => zmen('training_environment', v)} />

      {data.training_environment === 'other' && (
        <Pole id="training_environment_detail" popisek="Popiš kde" value={data.training_environment_detail}
          chyba={chyby.training_environment_detail} placeholder="Např. venkovní hřiště, workout park"
          onChange={(e) => zmen('training_environment_detail', e.target.value)} />
      )}

      {data.training_environment === 'home_equipment' && (
        <Vicenasobny popisek="Jaké vybavení máš" hodnoty={data.available_equipment}
          volby={EQUIPMENT_OPTIONS as any} volitelne
          napoveda="Podle toho vybereme cviky, které opravdu uděláš."
          onZmena={(v) => zmen('available_equipment', v)} />
      )}

      {data.training_environment && (
        <TreninkovaOmezeni
          prostredi={startProgramEnvironment({
            training_environment: data.training_environment,
            available_equipment: data.available_equipment
          }) as 'gym' | 'home_equipment' | 'home_bodyweight'}
          vybranePatterny={data.training_exclusion_patterns}
          vybranePartie={data.training_exclusion_muscles}
          generujeSe={odesilam}
          onZmenaPatternu={(v) => zmen('training_exclusion_patterns', v)}
          onZmenaPartii={(v) => zmen('training_exclusion_muscles', v)}
        />
      )}
    </div>
  );

  const krok4 = (
    <div className="space-y-5">
      <Vyber popisek="Stravovací preference" id="diet_type" hodnota={data.diet_type} volby={DIETA}
        volitelne onZmena={(v) => zmen('diet_type', v)} />
      <Pole id="dietary_restrictions" popisek="Zdravotní omezení" value={data.dietary_restrictions}
        volitelne placeholder="Alergie, intolerance, nemoci"
        onChange={(e) => zmen('dietary_restrictions', e.target.value)} />
      <Pole id="foods_to_avoid" popisek="Co nejíš" value={data.foods_to_avoid}
        volitelne placeholder="Např. ryby, houby, tvaroh"
        onChange={(e) => zmen('foods_to_avoid', e.target.value)} />
      <div>
        <Popisek htmlFor="notes" volitelne>Cokoli dalšího</Popisek>
        <textarea id="notes" rows={3} value={data.notes}
          onChange={(e) => zmen('notes', e.target.value)}
          placeholder="Co bychom měli vědět, než ti plán připravíme"
          className="w-full px-4 py-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors focus:border-cyan-500/60 resize-none" />
      </div>
    </div>
  );

  const krok5 = (
    <div className="space-y-5">
      {/* docs/DALSI_KROK.md 8.7 — cena a trial nebyly v registraci vidět nikde. */}
      <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800">
        <p className="text-xs font-semibold text-slate-200 mb-1.5">Než založíš účet</p>
        <p className="text-xs text-slate-400">
          Dostaneš osobní jídelníček a tréninkový plán, které se každý týden upravují podle tvého vývoje.
        </p>
        <p className="text-xs text-slate-400 mt-1.5">
          Návyky k sledování ti nastavíme podle cíle a aktivity — změnit si je můžeš kdykoli v profilu.
        </p>
        <div className="mt-2">{podminkaTrialu}</div>
      </div>
      {/* POUKAZ — volitelný. Ověřuje se při psaní, uplatní se až při
          založení účtu (atomicky na serveru). */}
      <div>
        <Pole
          id="kod-poukazu"
          popisek="Mám kód poukazu"
          volitelne
          value={kodPoukazu}
          onChange={(e) => setKodPoukazu(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          chyba={poukaz.stav === 'neplatny' ? `${poukaz.hlaska} Registrace proběhne bez poukazu.` : undefined}
          napoveda={poukaz.stav === 'platny'
            ? undefined
            : poukaz.stav === 'overuji' ? 'Ověřuji kód…' : 'Máš-li poukaz, najdeš kód pod QR kódem.'}
        />
        {poukaz.stav === 'platny' && (
          <p className="mt-1 text-[11px] font-semibold text-akcent-lime flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            Poukaz platí — {poukaz.dny} dní zdarma místo {TRIAL_DAYS}.
          </p>
        )}
      </div>
      {/* Odkazy vedou na VEŘEJNÝ web, ne do appky: právní texty musí být
          čitelné bez přihlášení a bez JavaScriptu. `target="_blank"`, aby
          si člověk vyplněnou registraci nesmazal odchodem ze stránky. */}
      <label className="flex gap-3 p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 cursor-pointer">
        <input
          type="checkbox"
          checked={souhlas}
          onChange={(e) => {
            setSouhlas(e.target.checked);
            setChyby((c) => ({ ...c, souhlas: '' }));
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
        />
        <span className="text-xs leading-relaxed text-slate-300">
          Souhlasím s{' '}
          <a href={ODKAZ_PODMINKY} target="_blank" rel="noreferrer"
            className="text-cyan-300 underline underline-offset-2">obchodními podmínkami</a>
          {' '}a se{' '}
          <a href={ODKAZ_GDPR} target="_blank" rel="noreferrer"
            className="text-cyan-300 underline underline-offset-2">zpracováním osobních údajů</a>
          {' '}včetně údajů o zdravotním stavu (váha, tělesné složení, spánek, tep).
          Chci, aby plán začal vznikat hned — beru na vědomí, že tím zaniká
          právo na odstoupení od smlouvy do 14 dnů.
        </span>
      </label>
      <Chyba text={chyby.souhlas} />
    </div>
  );

  const obsah = [krok1, krok2, krok3, krok4, krok5][krok - 1];
  const posledni = krok === (REGISTRATION_STEPS as number);

  return (
    <div className="min-h-screen bg-pozadi text-slate-100 relative overflow-x-hidden font-['Plus_Jakarta_Sans',sans-serif] flex items-start sm:items-center justify-center p-4 py-10">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-b from-cyan-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[550px] h-[450px] bg-lime-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        aria-busy={odesilam}
        className="w-full max-w-lg rounded-3xl bg-povrch/95 backdrop-blur-2xl border border-cyan-500/25 shadow-[0_8px_40px_rgba(0,0,0,0.6)] p-6 sm:p-8"
      >
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5 select-none mb-1">
          <span>Body &amp; Mind</span>
          <span className="text-akcent-lime font-extrabold drop-shadow-[0_0_12px_rgba(57,255,20,0.6)]">ON</span>
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Pár otázek a připravíme ti jídelníček i trénink na míru.
        </p>

        <Krokovac krok={krok} celkem={REGISTRATION_STEPS as number} nazev={KROKY[krok - 1]} />

        {/* Během generování plánu se nesmí dát sáhnout na NIC — ani na chipy
            návyků, ani na pole předchozích kroků. Samotné `disabled` na
            tlačítkách nestačí: uživatel si mezitím překlikal návyky, které
            už do právě odesílaného požadavku nemohly dojít, a viděl na
            obrazovce jiný výběr, než jaký se doopravdy uložil.
            <fieldset disabled> zablokuje celý podstrom nativně, včetně
            prvků, které o `odesilam` vůbec nevědí. */}
        <motion.div key={krok} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          <fieldset disabled={odesilam} className="contents">
            {obsah}
          </fieldset>
        </motion.div>

        {stav && (
          <div
            role={stav.typ === 'chyba' ? 'alert' : undefined}
            className={`mt-5 p-3 rounded-2xl text-xs border ${
              stav.typ === 'chyba'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {stav.text}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={zpet}
            disabled={odesilam}
            className="px-4 py-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-sm text-slate-300 hover:border-slate-700 transition-all active:scale-[0.99] disabled:opacity-50 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {krok === 1 ? 'Přihlášení' : 'Zpět'}
          </button>

          <button
            type="button"
            onClick={posledni ? odeslat : dal}
            disabled={odesilam || overuji}
            className="flex-1 py-3 rounded-2xl bg-akcent-lime text-na-akcentu font-bold text-sm shadow-[0_0_24px_rgba(57,255,20,0.35)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {(odesilam || overuji) && <Loader2 className="w-4 h-4 animate-spin" />}
            {odesilam
              ? 'Připravuji tvůj plán…'
              : overuji
                ? 'Ověřuji e-mail…'
                : posledni
                  ? 'Vytvořit účet a plán'
                  : 'Pokračovat'}
            {!odesilam && !overuji && !posledni && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>

        {odesilam && (
          <p className="mt-3 text-center text-[11px] text-slate-500">
            Generování plánu trvá zhruba půl minuty. Nezavírej prosím stránku.
          </p>
        )}

        <div className="mt-5 pt-4 border-t border-slate-800">
          {/* Odkaz pryč ze stránky fieldset nezablokuje — odchod uprostřed
              generování by nechal účet bez plánu, proto se vypíná zvlášť. */}
          <a
            href="https://bodyandmindon.cz/"
            aria-disabled={odesilam || undefined}
            tabIndex={odesilam ? -1 : undefined}
            onClick={(e) => { if (odesilam) e.preventDefault(); }}
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              odesilam
                ? 'text-slate-600 pointer-events-none'
                : 'text-slate-400 hover:text-cyan-400'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span>Zpět na hlavní stránku</span>
          </a>
        </div>
      </motion.div>
    </div>
  );
};
