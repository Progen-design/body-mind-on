import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import {
  getStep1FieldErrors,
  getStep2FieldErrors,
  getStep2FieldBlurError
} from '@lib/registration/registrationStepValidation.js';
import { getFrequencyDayRange } from '@lib/preferenceConstants.js';
import { REGISTRATION_STEPS } from '@lib/registrationRules.js';
import { POSITIVE_HABITS, NEGATIVE_HABITS, getSuggestedHabits } from '@lib/habits.js';
import { TRAINING_ENVIRONMENT_OPTIONS, EQUIPMENT_OPTIONS } from '@lib/trainingEnvironment.js';
import { supabase } from '@lib/supabaseClient.js';
import {
  fetchRegistrationEmailAvailable,
  EMAIL_TAKEN_MESSAGE_CS,
  EMAIL_CHECK_FAILED_MESSAGE_CS
} from '@lib/registration/checkEmailAvailableClient.js';
import { useKontrolaEmailu } from '../../hooks/useKontrolaEmailu';
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
};

const PRAZDNY: Formular = {
  name: '', email: '', password: '', passwordConfirm: '',
  gender: '', birth_date: '', height: '', weight: '',
  smart_scale_choice: 'none', activity: '', stress: '', worktype: '',
  goal: '', frequency: '', workout_days: [],
  training_environment: '', training_environment_detail: '',
  available_equipment: [], diet_type: '', dietary_restrictions: '',
  foods_to_avoid: '', notes: '', program: 'START', devices: []
};

interface Props {
  onHotovo: (kam: string) => void;
  onZpetNaPrihlaseni: () => void;
}

export const StartRegistrace: React.FC<Props> = ({ onHotovo, onZpetNaPrihlaseni }) => {
  const [krok, setKrok] = useState(1);
  const [data, setData] = useState<Formular>(PRAZDNY);
  const [navyky, setNavyky] = useState<string[]>([]);
  const [chyby, setChyby] = useState<Record<string, string>>({});
  const [stav, setStav] = useState<{ typ: 'chyba' | 'ok'; text: string } | null>(null);
  const [odesilam, setOdesilam] = useState(false);
  const [overuji, setOveruji] = useState(false);

  // Dostupnost e-mailu se hlida uz pri psani.
  const stavEmailu = useKontrolaEmailu(data.email);
  const uctExistuje = stavEmailu === 'obsazeny';

  const zmen = <K extends keyof Formular>(klic: K, hodnota: Formular[K]) => {
    setData((d) => ({ ...d, [klic]: hodnota }));
    setChyby((c) => {
      if (!c[klic as string]) return c;
      const { [klic as string]: _, ...zbytek } = c;
      return zbytek;
    });
  };

  const maxDnu = useMemo(() => getFrequencyDayRange(data.frequency).max as number, [data.frequency]);

  const doporucene = useMemo(
    () => getSuggestedHabits({ goal: data.goal, activity: data.activity, stress: data.stress }) as string[],
    [data.goal, data.activity, data.stress]
  );

  const vsechnyNavyky = useMemo(
    () => [
      ...POSITIVE_HABITS.map((h: any) => ({ value: h.id as string, label: `${h.emoji} ${h.label}` })),
      ...NEGATIVE_HABITS.map((h: any) => ({ value: h.id as string, label: `${h.emoji} ${h.label}` }))
    ],
    []
  );

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
    if (k === 5 && navyky.length === 0) {
      return { navyky: 'Vyber aspoň jeden návyk, se kterým chceš začít.' };
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
    // tehdy, kdyz vysledek jeste nemame (napr. vlozeni schranky a hned klik).
    if (krok === 1) {
      if (uctExistuje) {
        setChyby((c) => ({ ...c, email: EMAIL_TAKEN_MESSAGE_CS }));
        return;
      }
      if (stavEmailu !== 'volny') {
        setOveruji(true);
        const vysledek = await fetchRegistrationEmailAvailable(data.email);
        setOveruji(false);
        if (!vysledek.available && !vysledek.networkError && !vysledek.rateLimited) {
          setChyby((c) => ({ ...c, email: EMAIL_TAKEN_MESSAGE_CS }));
          return;
        }
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
    // Shoda na vyznamu, ne na presnem zneni. Predchozi vzor hledal "e-mail už",
    // jenze API pise "e-mailem už existuje" - uzivatel pak zustal na kroku 5
    // s chybou o poli, ktere je o ctyri kroky zpatky.
    if (/už existuje|už je registrovan|nelze opakovat|already (registered|exists)/i.test(zprava)) {
      setChyby({ email: EMAIL_TAKEN_MESSAGE_CS });
      setKrok(1);
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
        body: JSON.stringify({ ...data, selected_habits: navyky })
      });

      const text = await odpoved.text();
      const vysledek = text ? JSON.parse(text) : {};

      if (odpoved.ok && (vysledek.plan_state === 'ready' || vysledek.plan_state === 'processing')) {
        setStav({ typ: 'ok', text: vysledek.message || 'Účet je vytvořený. Otevírám tvůj plán…' });
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

  const krok1 = (
    <div className="space-y-4">
      <Pole id="name" popisek="Jméno" value={data.name} chyba={chyby.name}
        autoComplete="name" placeholder="Jak ti máme říkat"
        onChange={(e) => zmen('name', e.target.value)} />
      <div>
        <Pole id="email" popisek="E-mail" type="email" value={data.email}
          chyba={chyby.email || (uctExistuje ? EMAIL_TAKEN_MESSAGE_CS : null)}
          autoComplete="email" placeholder="tvuj@email.cz"
          onChange={(e) => zmen('email', e.target.value)} />
        {stavEmailu === 'overuji' && (
          <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Ověřuji e-mail…
          </p>
        )}
        {stavEmailu === 'volny' && (
          <p className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1.5">
            <Check className="w-3 h-3" /> E-mail je volný.
          </p>
        )}
        {stavEmailu === 'nelze' && (
          <p className="mt-1.5 text-[11px] text-amber-400">{EMAIL_CHECK_FAILED_MESSAGE_CS}</p>
        )}
      </div>
      <Pole id="password" popisek="Heslo" type="password" value={data.password} chyba={chyby.password}
        autoComplete="new-password" placeholder="Aspoň 6 znaků"
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
            className="w-full py-2.5 rounded-xl bg-[#39ff14] text-[#08090d] font-bold text-xs"
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
                    ? 'bg-[#39ff14]/15 border-[#39ff14]/60 text-[#39ff14]'
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
      {doporucene.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex gap-2.5">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300">
            Podle tvého cíle a aktivity dávají smysl hlavně tyhle:{' '}
            <span className="text-cyan-300 font-semibold">
              {doporucene
                .map((id) => [...POSITIVE_HABITS, ...NEGATIVE_HABITS].find((h: any) => h.id === id)?.label)
                .filter(Boolean)
                .join(', ')}
            </span>
          </p>
        </div>
      )}
      <Vicenasobny popisek="Návyky, které chceš sledovat" hodnoty={navyky} volby={vsechnyNavyky}
        napoveda="Vyber aspoň jeden. Přidat další můžeš kdykoli v profilu."
        onZmena={(v) => { setNavyky(v); setChyby((c) => ({ ...c, navyky: '' })); }} />
      <Chyba text={chyby.navyky} />
    </div>
  );

  const obsah = [krok1, krok2, krok3, krok4, krok5][krok - 1];
  const posledni = krok === (REGISTRATION_STEPS as number);

  return (
    <div className="min-h-screen bg-[#08090d] text-slate-100 relative overflow-x-hidden font-['Plus_Jakarta_Sans',sans-serif] flex items-start sm:items-center justify-center p-4 py-10">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-b from-cyan-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[550px] h-[450px] bg-lime-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg rounded-3xl bg-[#0c1017]/95 backdrop-blur-2xl border border-cyan-500/25 shadow-[0_8px_40px_rgba(0,0,0,0.6)] p-6 sm:p-8"
      >
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5 select-none mb-1">
          <span>Body &amp; Mind</span>
          <span className="text-[#39ff14] font-extrabold drop-shadow-[0_0_12px_rgba(57,255,20,0.6)]">ON</span>
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Pár otázek a připravíme ti jídelníček i trénink na míru.
        </p>

        <Krokovac krok={krok} celkem={REGISTRATION_STEPS as number} nazev={KROKY[krok - 1]} />

        <motion.div key={krok} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          {obsah}
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
            className="flex-1 py-3 rounded-2xl bg-[#39ff14] text-[#08090d] font-bold text-sm shadow-[0_0_24px_rgba(57,255,20,0.35)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      </motion.div>
    </div>
  );
};
