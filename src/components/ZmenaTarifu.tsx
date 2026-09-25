import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { ODKAZ_PODMINKY } from '@lib/pravniOdkazy.js';

/**
 * PŘECHOD MEZI TARIFY U BĚŽÍCÍHO PŘEDPLATNÉHO (START ↔ ON CLUB).
 *
 * Nový Checkout by pro existující předplatné vrátil 409 (druhé předplatné).
 * Tady se mění tatáž subscription přes /api/subscription/change-tier:
 *   - START → ON CLUB hned, doplatek za zbytek období (v trialu 0 Kč).
 *     Před potvrzením náhled ceny a souhlas s obchodními podmínkami.
 *   - ON CLUB → START od dalšího období, bez vratky; jde zrušit.
 *
 * Co jde a za kolik, říká server (GET). UI nic nepočítá.
 */
interface Stav {
  muze_menit: boolean;
  tier?: 'START' | 'ON_CLUB';
  cil?: 'START' | 'ON_CLUB';
  dnes_kc?: number;
  dal_kc?: number;
  od?: string | null;
  naplanovano?: boolean;
}

interface Props {
  /** Dotaz jen s nastaveným předplatným (trial s kartou / aktivní). */
  aktivni: boolean;
  /** Po změně — App dotáhne profil (tier přepíše webhook za pár vteřin). */
  onZmena?: () => void;
}

const kc = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`;
const datum = (iso?: string | null) => {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric' })
    : null;
};

/** Věta náhledu upgradu: „Dnes doplatíš X Kč, dál 1 499 Kč/měsíc" / v trialu „Dnes 0 Kč, od <datum> …". */
function textNahleduUpgradu(s: Pick<Stav, 'dnes_kc' | 'dal_kc' | 'od'>): string {
  const dal = kc(s.dal_kc ?? 0);
  const od = datum(s.od);
  if (od) return `Dnes 0 Kč, od ${od} ${dal}/měsíc`;
  return `Dnes doplatíš ${kc(s.dnes_kc ?? 0)}, dál ${dal}/měsíc`;
}

const TLACITKO = 'px-3 py-1.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-50';

export const ZmenaTarifu: React.FC<Props> = ({ aktivni, onZmena }) => {
  const [stav, setStav] = useState<Stav | null>(null);
  const [otevreno, setOtevreno] = useState(false);
  const [souhlas, setSouhlas] = useState(false);
  const [odesilam, setOdesilam] = useState(false);
  const [zprava, setZprava] = useState<{ typ: 'ok' | 'chyba'; text: string } | null>(null);

  const nacti = useCallback(() => {
    apiFetch<Stav>('/api/subscription/change-tier', { method: 'GET' })
      .then(setStav)
      .catch(() => setStav(null));
  }, []);

  useEffect(() => {
    if (aktivni) nacti();
  }, [aktivni, nacti]);

  if (!stav?.muze_menit) return zprava ? <p className="mt-3 text-xs text-emerald-300">{zprava.text}</p> : null;

  const zavolej = async (init: RequestInit, hotovo: string) => {
    setOdesilam(true);
    setZprava(null);
    try {
      await apiFetch('/api/subscription/change-tier', init);
      setZprava({ typ: 'ok', text: hotovo });
      setOtevreno(false);
      setSouhlas(false);
      nacti();
      onZmena?.();
    } catch (chyba: any) {
      setZprava({ typ: 'chyba', text: chyba?.message || 'Změna se nepodařila. Zkus to prosím za chvíli.' });
    } finally {
      setOdesilam(false);
    }
  };

  const upgrade = stav.cil === 'ON_CLUB';
  const od = datum(stav.od);

  return (
    <div className="mt-3">
      {/* Naplánovaný downgrade: věta + možnost změnu zrušit */}
      {!upgrade && stav.naplanovano ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-slate-300">
            Od {od ?? 'dalšího období'} přejdeš na START ({kc(stav.dal_kc ?? 599)}/měsíc). Do té doby zůstáváš v ON CLUBU.
          </p>
          <button
            type="button"
            onClick={() => zavolej({ method: 'DELETE' }, 'Změna je zrušená, zůstáváš v ON CLUBU.')}
            disabled={odesilam}
            className={`${TLACITKO} border-slate-700 bg-slate-950 text-slate-200`}
          >
            {odesilam ? 'Ruším…' : 'Zrušit změnu'}
          </button>
        </div>
      ) : !otevreno ? (
        <button
          type="button"
          onClick={() => { setOtevreno(true); setZprava(null); }}
          className={`${TLACITKO} ${upgrade ? 'border-lime-500/40 bg-lime-950/40 text-akcent-lime' : 'border-slate-800 bg-slate-950 text-slate-300'}`}
        >
          {upgrade ? 'Přejít na ON CLUB' : 'Přejít na START'}
        </button>
      ) : (
        <div role="dialog" aria-label={upgrade ? 'Přechod na ON CLUB' : 'Přechod na START'} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
          <h5 className="text-sm font-bold text-slate-100">{upgrade ? 'Přechod na ON CLUB' : 'Přechod na START'}</h5>
          {upgrade ? (
            <>
              <p className="text-sm font-semibold text-white">{textNahleduUpgradu(stav)}</p>
              <p className="text-xs text-slate-400">
                Komunita s psaním a všechno ze STARTu. Zrušíš kdykoli ke konci zaplaceného období.
              </p>
              <label className="flex items-start gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={souhlas} onChange={(e) => setSouhlas(e.target.checked)} className="mt-0.5" />
                <span>
                  Souhlasím s{' '}
                  <a href={ODKAZ_PODMINKY} target="_blank" rel="noreferrer" className="underline underline-offset-2">obchodními podmínkami</a>{' '}
                  a beru na vědomí, že služba začne hned a při odstoupení do 14 dnů zaplatím poměrnou část.
                </span>
              </label>
            </>
          ) : (
            <p className="text-xs text-slate-300">
              Od {od ?? 'dalšího období'} budeš ve STARTu za {kc(stav.dal_kc ?? 599)}/měsíc. Do té doby zůstáváš v ON CLUBU, nic se nevrací.
              Komunitu pak budeš jen číst.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={odesilam || (upgrade && !souhlas)}
              onClick={() => (upgrade
                ? zavolej({ method: 'POST', body: JSON.stringify({ tier: 'ON_CLUB', souhlas: true }) }, 'Hotovo — jsi v ON CLUBU. Potvrzení ti přišlo e-mailem.')
                : zavolej({ method: 'POST', body: JSON.stringify({ tier: 'START' }) }, `Změna je naplánovaná — od ${od ?? 'dalšího období'} přejdeš na START.`))}
              className={`${TLACITKO} border-lime-500/40 bg-lime-950/40 text-akcent-lime`}
            >
              {odesilam ? 'Měním…' : upgrade ? 'Potvrdit přechod na ON CLUB' : 'Potvrdit přechod na START'}
            </button>
            <button type="button" onClick={() => { setOtevreno(false); setSouhlas(false); }} disabled={odesilam} className={`${TLACITKO} border-slate-800 bg-slate-950 text-slate-300`}>
              Zpět
            </button>
          </div>
        </div>
      )}
      {zprava && <p role={zprava.typ === 'chyba' ? 'alert' : undefined} className={`mt-2 text-xs ${zprava.typ === 'chyba' ? 'text-rose-400' : 'text-emerald-300'}`}>{zprava.text}</p>}
    </div>
  );
};
