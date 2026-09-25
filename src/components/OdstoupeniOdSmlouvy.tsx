import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

/**
 * ODSTOUPENÍ OD SMLOUVY DO 14 DNŮ — vedle „Zrušit předplatné".
 *
 * Zrušení platí ke konci období (peníze se nevrací, služba běží dál).
 * Odstoupení ukončí předplatné HNED a vrátí zaplacenou částku po odečtení
 * poměrné části za dny, kdy služba běžela (api/subscription/withdraw.js).
 *
 * Tlačítko se ukáže jen tehdy, když server řekne `narok: true` — do 14 dnů
 * od první PLACENÉ faktury. Nárok ani částku si UI nepočítá.
 *
 * Dva kroky: (1) formulář s předvyplněným jménem a e-mailem a needitovatelnou
 * identifikací smlouvy (tarif + datum první platby), (2) „Potvrdit odstoupení
 * od smlouvy". Omylem se to proklikat nedá — a vrátit to zpět nejde.
 */
interface Nahled {
  narok: boolean;
  duvod?: string;
  tarif?: string;
  datum_prvni_platby?: string;
  zaplaceno_kc?: number;
  vratka_kc?: number;
  dny_vyuzito?: number;
}

interface Props {
  /** Dotaz na server jen u běžícího placeného předplatného (stav 'active'). */
  aktivni: boolean;
  jmeno: string;
  email: string;
  /** Po úspěchu — App dotáhne profil znovu (členství je 'canceled'). */
  onHotovo?: () => void;
}

export const OdstoupeniOdSmlouvy: React.FC<Props> = ({ aktivni, jmeno: jmenoVychozi, email: emailVychozi, onHotovo }) => {
  const [nahled, setNahled] = useState<Nahled | null>(null);
  const [otevreno, setOtevreno] = useState(false);
  const [jmeno, setJmeno] = useState(jmenoVychozi);
  const [email, setEmail] = useState(emailVychozi);
  const [odesilam, setOdesilam] = useState(false);
  const [vysledek, setVysledek] = useState<{ typ: 'ok' | 'chyba'; text: string } | null>(null);

  useEffect(() => {
    if (!aktivni) return undefined;
    let zive = true;
    apiFetch<Nahled>('/api/subscription/withdraw', { method: 'GET' })
      .then((data) => { if (zive) setNahled(data); })
      .catch(() => { if (zive) setNahled(null); });
    return () => { zive = false; };
  }, [aktivni]);

  if (vysledek?.typ === 'ok') {
    return <p className="mt-3 text-xs text-emerald-300 leading-relaxed">{vysledek.text}</p>;
  }
  if (!nahled?.narok) return null;

  const potvrdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOdesilam(true);
    setVysledek(null);
    try {
      const odpoved = await apiFetch<{ vratka_kc: number }>('/api/subscription/withdraw', {
        method: 'POST',
        body: JSON.stringify({ jmeno: jmeno.trim(), email: email.trim() }),
      });
      setVysledek({
        typ: 'ok',
        text: `Odstoupení je přijaté a předplatné ukončené. Vracíme ${odpoved.vratka_kc} Kč — na účtu je uvidíš obvykle do 5–10 pracovních dní. Potvrzení ti přišlo e-mailem.`,
      });
      onHotovo?.();
    } catch (chyba: any) {
      setVysledek({ typ: 'chyba', text: chyba?.message || 'Odstoupení se nepodařilo. Zkus to prosím za chvíli.' });
    } finally {
      setOdesilam(false);
    }
  };

  if (!otevreno) {
    return (
      <button
        type="button"
        onClick={() => setOtevreno(true)}
        className="mt-3 ml-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 hover:border-slate-600 transition-all"
      >
        Odstoupit od smlouvy
      </button>
    );
  }

  return (
    <form onSubmit={potvrdit} className="mt-4 p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
      <h5 className="text-sm font-bold text-slate-100">Odstoupení od smlouvy</h5>
      <p className="text-xs text-slate-400 leading-relaxed">
        Předplatné skončí hned. Vrátíme zaplacenou částku po odečtení poměrné části
        za dny, kdy služba už běžela — teď by to bylo <strong className="text-slate-200">{nahled.vratka_kc} Kč</strong> z {nahled.zaplaceno_kc} Kč.
      </p>

      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Tarif</dt>
        <dd className="text-slate-200 font-semibold">{nahled.tarif}</dd>
        <dt className="text-slate-500">První platba</dt>
        <dd className="text-slate-200 font-semibold">{nahled.datum_prvni_platby}</dd>
      </dl>

      <label className="block text-xs text-slate-400">
        Jméno
        <input
          type="text"
          value={jmeno}
          onChange={(e) => setJmeno(e.target.value)}
          required
          autoComplete="name"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-sm text-slate-100 outline-none focus:border-cyan-500/60"
        />
      </label>
      <label className="block text-xs text-slate-400">
        E-mail
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-sm text-slate-100 outline-none focus:border-cyan-500/60"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={odesilam || !jmeno.trim() || !email.trim()}
          className="px-3 py-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs font-bold text-rose-300 hover:border-rose-500/70 disabled:opacity-50 transition-all"
        >
          {odesilam ? 'Odesílám…' : 'Potvrdit odstoupení od smlouvy'}
        </button>
        <button
          type="button"
          onClick={() => { setOtevreno(false); setVysledek(null); }}
          disabled={odesilam}
          className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 disabled:opacity-50 transition-all"
        >
          Zpět
        </button>
      </div>
      {vysledek?.typ === 'chyba' && <p role="alert" className="text-xs text-rose-400">{vysledek.text}</p>}
    </form>
  );
};
