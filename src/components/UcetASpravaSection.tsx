import React, { useMemo, useState } from 'react';
import { CreditCard, Trash2, ShieldAlert, Mail, Calendar, Edit3 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { NadpisSekce } from './NadpisSekce';
import { PredplatneNabidka } from './PredplatneNabidka';
import { Avatar } from './Avatar';
import { MembershipStatusBadge } from './MembershipStatusBadge';
import type { UserPreferences, UserProfile, ZamcenyPlan } from '../types';
import { ODKAZ_PODMINKY, ODKAZ_GDPR } from '@lib/pravniOdkazy.js';

/**
 * ÚČET A PŘEDPLATNÉ — dvě věci, které obchodní podmínky slibují a appka
 * do 9. 9. 2026 neuměla.
 *
 * Bod 9 podmínek: „Předplatné můžeš kdykoli zrušit ve svém profilu."
 * Bod 11 a zásady ochrany údajů: „Účet i s daty můžeš nechat smazat —
 * použij smazání účtu v profilu."
 *
 * Endpoint na smazání (`/api/delete-account`) přitom existoval od začátku,
 * jen na něj v `src/` nevedl JEDINÝ odkaz. Zrušení předplatného neexistovalo
 * vůbec. Text tedy sliboval dvě věci, ze kterých jedna nešla najít a druhá
 * nebyla. Tahle sekce obojí zpřístupňuje na jednom místě — v profilu, přesně
 * tam, kam podmínky ukazují.
 *
 * OBĚ AKCE MAJÍ POTVRZENÍ, ale různě tvrdé: zrušení předplatného je vratné
 * (`obnovit`), takže stačí jeden dotaz. Smazání účtu vratné NENÍ, proto se
 * opisuje slovo — omylem kliknout na tlačítko jde, omylem napsat SMAZAT ne.
 */
const SLOVO_POTVRZENI = 'SMAZAT';

interface UcetASpravaSectionProps {
  /**
   * Plné srovnání START/ON Club/VIP se kreslí jen tady a v úzkém countdown
   * pruhu pod hlavičkou (PROMPT_UX_DNES.md bod A.8 + C) — nikde jinde. null
   * nebo odemčený plán = nic k prodeji, PredplatneNabidka se nezobrazí.
   */
  plan?: ZamcenyPlan | null;
  /**
   * PROMPT_DNES_HERO.md — karta „Profil" (jméno, e-mail, člen od, věk,
   * výška) přebírá identitu z bývalé `ProfilHlavicka.tsx`, kterou na Dnes
   * nahradil hero. Nic se nemaže, jen se to stěhuje sem a do menu v hlavičce.
   */
  profile: UserProfile;
  preferences: UserPreferences;
  birthDate?: string | null;
  registrovanOd?: string | null;
  onEditPreferences: () => void;
}

export const UcetASpravaSection: React.FC<UcetASpravaSectionProps> = ({
  plan = null,
  profile,
  preferences,
  birthDate = null,
  registrovanOd = null,
  onEditPreferences,
}) => {
  const { account, logout } = useAuth();

  // Věk a „Člen od" — stejný výpočet jako dřív ProfilHlavicka.tsx.
  const vekLet = useMemo(() => {
    const t = Date.parse(String(birthDate || ''));
    if (!Number.isFinite(t)) return null;
    const nar = new Date(t);
    const dnes = new Date();
    let vek = dnes.getFullYear() - nar.getFullYear();
    const m = dnes.getMonth() - nar.getMonth();
    if (m < 0 || (m === 0 && dnes.getDate() < nar.getDate())) vek--;
    return vek >= 0 && vek < 130 ? vek : null;
  }, [birthDate]);

  const clenOd = useMemo(() => {
    const t = Date.parse(String(registrovanOd || ''));
    if (!Number.isFinite(t)) return null;
    return new Date(t).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
  }, [registrovanOd]);

  const [rusim, setRusim] = useState(false);
  const [zruseniStav, setZruseniStav] = useState<{ typ: 'ok' | 'chyba'; text: string } | null>(null);
  const [ptamSeNaZruseni, setPtamSeNaZruseni] = useState(false);

  const [mazu, setMazu] = useState(false);
  const [mazaniOtevrene, setMazaniOtevrene] = useState(false);
  const [opsaneSlovo, setOpsaneSlovo] = useState('');
  const [chybaMazani, setChybaMazani] = useState<string | null>(null);

  const zrusitPredplatne = async (obnovit: boolean) => {
    setRusim(true);
    setZruseniStav(null);
    try {
      const odpoved = await apiFetch<{ zruseno: boolean; bezi_do: string | null }>(
        '/api/subscription/cancel',
        { method: 'POST', body: JSON.stringify({ obnovit }) }
      );
      const doKdy = odpoved.bezi_do
        ? new Date(odpoved.bezi_do).toLocaleDateString('cs-CZ')
        : null;
      setZruseniStav({
        typ: 'ok',
        text: odpoved.zruseno
          ? doKdy
            ? `Předplatné je zrušené. Služba ti běží do ${doKdy}, pak se nic nestrhne.`
            : 'Předplatné je zrušené. Do konce zaplaceného období ti služba běží dál.'
          : 'Předplatné je zase aktivní.',
      });
      setPtamSeNaZruseni(false);
    } catch (chyba: any) {
      setZruseniStav({ typ: 'chyba', text: chyba?.message || 'Nepodařilo se to. Zkus to za chvíli.' });
    } finally {
      setRusim(false);
    }
  };

  const smazatUcet = async () => {
    if (opsaneSlovo.trim().toUpperCase() !== SLOVO_POTVRZENI) return;
    setMazu(true);
    setChybaMazani(null);
    try {
      await apiFetch('/api/delete-account', {
        method: 'POST',
        body: JSON.stringify({ confirm: true })
      });
      logout();
    } catch (chyba: any) {
      setChybaMazani(chyba?.message || 'Účet se nepodařilo smazat. Napiš nám na info@bodyandmindon.cz.');
      setMazu(false);
    }
  };

  return (
    <div className="space-y-4">
      <NadpisSekce
        titulek="Účet a předplatné"
        // PROMPT_UX_DOLADENI.md bod F — sekce od PROMPT_UX_DNES.md (18. 9.)
        // začíná výběrem členství (PredplatneNabidka výš), ale podtitulek
        // o něm mlčel — Honza nabídku přehlédl a myslel si, že tam není.
        podtitulek="Členství, zrušení předplatného a smazání účtu"
        ikona={<CreditCard className="w-5 h-5 text-slate-400" />}
      />

      {/* PROFIL — jméno, e-mail, člen od, věk, výška. Přestěhováno z
          bývalé ProfilHlavicka.tsx (PROMPT_DNES_HERO.md): na Dnes ji
          nahradil hero „Tvůj den", který denní identitu nepotřebuje. */}
      <div className="p-4 sm:p-5 rounded-2xl bg-karta/90 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar
              jmeno={account?.name || profile.name}
              src={account?.avatarUrl || profile.avatarUrl}
              className="w-14 h-14 rounded-2xl bg-slate-900 shrink-0"
              textClassName="text-lg"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-slate-100">{account?.name || profile.name}</h4>
                <MembershipStatusBadge status={profile.status} trialDniDoKonce={profile.trialDniDoKonce} variant="card" />
              </div>
              {account?.email && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{account.email}</span>
                </p>
              )}
              <div className="flex items-center gap-2.5 text-xs text-slate-400 mt-1.5 flex-wrap">
                {clenOd && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    Člen od {clenOd}
                  </span>
                )}
                {vekLet !== null && (
                  <>
                    {clenOd && <span aria-hidden="true">·</span>}
                    <span>Věk: <strong className="text-slate-200">{vekLet} let</strong></span>
                  </>
                )}
                {preferences.currentHeightCm > 0 && (
                  <>
                    {(clenOd || vekLet !== null) && <span aria-hidden="true">·</span>}
                    <span>Výška: <strong className="text-slate-200">{preferences.currentHeightCm} cm</strong></span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onEditPreferences}
            className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 transition-all active:scale-95"
          >
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Upravit cíle</span>
          </button>
        </div>
      </div>

      {/* PLNÉ SROVNÁNÍ TIERŮ — jen když je co prodávat (viz komentář u props). */}
      {plan?.zamceno && (
        <div className="p-4 sm:p-5 rounded-2xl bg-karta/90 border border-slate-800">
          <h4 className="text-sm font-bold text-slate-100 mb-3">Odemknout členství</h4>
          <PredplatneNabidka plan={plan} />
        </div>
      )}

      {/* ZRUŠENÍ PŘEDPLATNÉHO */}
      <div className="p-4 sm:p-5 rounded-2xl bg-karta/90 border border-slate-800">
        <h4 className="text-sm font-bold text-slate-100">Předplatné</h4>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
          Zrušit můžeš kdykoli. Služba ti běží do konce už zaplaceného období —
          o dny, které máš zaplacené, nepřijdeš. Když zrušíš ve zkušebním
          období, neplatíš nic.
        </p>

        {!ptamSeNaZruseni ? (
          <button
            type="button"
            onClick={() => { setPtamSeNaZruseni(true); setZruseniStav(null); }}
            className="mt-3 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 hover:border-slate-600 transition-all"
          >
            Zrušit předplatné
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-300">Opravdu zrušit?</span>
            <button
              type="button"
              onClick={() => zrusitPredplatne(false)}
              disabled={rusim}
              className="px-3 py-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs font-bold text-rose-300 hover:border-rose-500/70 disabled:opacity-50 transition-all"
            >
              {rusim ? 'Ruším…' : 'Ano, zrušit'}
            </button>
            <button
              type="button"
              onClick={() => setPtamSeNaZruseni(false)}
              disabled={rusim}
              className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 disabled:opacity-50 transition-all"
            >
              Nechat běžet
            </button>
          </div>
        )}

        {zruseniStav && (
          <div className={`mt-3 text-xs ${zruseniStav.typ === 'chyba' ? 'text-rose-400' : 'text-emerald-300'}`}>
            {zruseniStav.text}
            {zruseniStav.typ === 'ok' && zruseniStav.text.startsWith('Předplatné je zrušené') && (
              <button
                type="button"
                onClick={() => zrusitPredplatne(true)}
                disabled={rusim}
                className="ml-2 underline underline-offset-2 text-slate-300 disabled:opacity-50"
              >
                Vrátit zpět
              </button>
            )}
          </div>
        )}
      </div>

      {/* SMAZÁNÍ ÚČTU */}
      <div className="p-4 sm:p-5 rounded-2xl bg-karta/90 border border-rose-500/20">
        <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          Smazání účtu
        </h4>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
          Smaže účet i všechna tvá data — plány, měření, záznamy. Je to
          nevratné. Zůstanou jen účetní doklady, které musíme ze zákona
          uchovat.
        </p>

        {!mazaniOtevrene ? (
          <button
            type="button"
            onClick={() => setMazaniOtevrene(true)}
            className="mt-3 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-bold text-slate-400 hover:border-rose-500/40 hover:text-rose-300 inline-flex items-center gap-1.5 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Smazat účet
          </button>
        ) : (
          <div className="mt-3 space-y-2.5">
            {/* Opisování slova, ne jen druhý klik: smazání je nevratné
                a dvě tlačítka po sobě se dají proklikat omylem. */}
            <label className="block text-xs text-slate-300">
              Pro potvrzení napiš <span className="font-bold text-rose-300">{SLOVO_POTVRZENI}</span>:
            </label>
            <input
              type="text"
              value={opsaneSlovo}
              onChange={(e) => setOpsaneSlovo(e.target.value)}
              placeholder={SLOVO_POTVRZENI}
              autoComplete="off"
              className="w-full max-w-[12rem] px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-rose-500/60 transition-colors"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={smazatUcet}
                disabled={mazu || opsaneSlovo.trim().toUpperCase() !== SLOVO_POTVRZENI}
                className="px-3 py-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs font-bold text-rose-300 hover:border-rose-500/70 disabled:opacity-40 transition-all"
              >
                {mazu ? 'Mažu…' : 'Smazat účet nenávratně'}
              </button>
              <button
                type="button"
                onClick={() => { setMazaniOtevrene(false); setOpsaneSlovo(''); setChybaMazani(null); }}
                disabled={mazu}
                className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 disabled:opacity-50 transition-all"
              >
                Zrušit
              </button>
            </div>
            {chybaMazani && <p className="text-xs text-rose-400">{chybaMazani}</p>}
          </div>
        )}
      </div>

      {/* PRÁVNÍ DOKUMENTY — odkazy na veřejný web, ne do SPA. */}
      <p className="text-[11px] text-slate-500">
        <a href={ODKAZ_PODMINKY} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-300">
          Obchodní podmínky
        </a>
        {' · '}
        <a href={ODKAZ_GDPR} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-300">
          Ochrana osobních údajů
        </a>
      </p>
    </div>
  );
};
