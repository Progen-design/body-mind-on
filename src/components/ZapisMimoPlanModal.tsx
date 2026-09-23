import React, { useState } from 'react';
import { X, Camera, ImagePlus, Type, Loader2, AlertTriangle, Sparkles, Trash2, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '../lib/api';
import { zmensFotku } from '../lib/zmensFotku';
import { naZapisMimoPlan, ZapisMimoPlan } from '../data/adaptery';

/**
 * ZAPSAT JÍDLO MIMO PLÁN — fotka nebo text → AI odhad → potvrzení.
 *
 * Tři kroky: vstup (fotka / text), čekání na model (2–5 s), karta s odhadem.
 * Odhad je po odpovědi serveru už uložený; „Uložit" pošle opravu (PATCH),
 * jen když uživatel nějaké číslo změnil, „Zahodit" zápis smaže.
 *
 * Na kartě odhadu nejde modal zavřít křížkem ani klikem vedle — zápis už
 * v databázi je a musí se buď potvrdit, nebo zahodit. Jinak by se v součtu
 * objevilo jídlo, o kterém uživatel neví, že ho uložil.
 */
interface Props {
  onZavri: () => void;
  /** Rodič zápis hned přidá do přehledu a případnou opravu odešle sám. */
  onUlozit: (puvodni: ZapisMimoPlan, upraveny: ZapisMimoPlan, zmeneno: boolean) => void;
}

/** Stačí na odhad porce a posílá se ~100 kB místo megabajtů. */
const HRANA_FOTKY_PX = 1024;

const POPIS_JISTOTY: Record<NonNullable<ZapisMimoPlan['jistota']>, string> = {
  low: 'Hrubý odhad — zkontroluj čísla',
  medium: 'Přibližný odhad',
  high: 'Odhad s vyšší jistotou',
};

type Pole = 'kcal' | 'protein' | 'carbs' | 'fat';
const POLE: { klic: Pole; label: string; jednotka: string }[] = [
  { klic: 'kcal', label: 'Energie', jednotka: 'kcal' },
  { klic: 'protein', label: 'Bílkoviny', jednotka: 'g' },
  { klic: 'carbs', label: 'Sacharidy', jednotka: 'g' },
  { klic: 'fat', label: 'Tuky', jednotka: 'g' },
];

const naText = (n: number) => String(n).replace('.', ',');
const naCislo = (s: string) => Number(s.replace(',', '.').trim());

export const ZapisMimoPlanModal: React.FC<Props> = ({ onZavri, onUlozit }) => {
  const [rezim, setRezim] = useState<'foto' | 'text'>('foto');
  const [faze, setFaze] = useState<'vstup' | 'cekam' | 'odhad'>('vstup');
  const [foto, setFoto] = useState<string | null>(null);
  const [zpracovavam, setZpracovavam] = useState(false);
  const [popis, setPopis] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [odhad, setOdhad] = useState<ZapisMimoPlan | null>(null);
  const [hodnoty, setHodnoty] = useState<Record<Pole, string>>({ kcal: '', protein: '', carbs: '', fat: '' });
  const [zahazuji, setZahazuji] = useState(false);

  const vyberFotku = async (soubory: FileList | null) => {
    const soubor = soubory?.[0];
    if (!soubor) return;
    setZpracovavam(true);
    setChyba(null);
    try {
      setFoto(await zmensFotku(soubor, HRANA_FOTKY_PX));
    } catch {
      setChyba('Fotku se nepodařilo načíst. Zkus jinou.');
    } finally {
      setZpracovavam(false);
    }
  };

  const odesli = async () => {
    setFaze('cekam');
    setChyba(null);
    try {
      const telo = rezim === 'foto' ? { foto_base64: foto } : { popis: popis.trim() };
      const { zapis } = await apiFetch<{ zapis: unknown }>('/api/nutrition/quick-log', {
        method: 'POST',
        body: JSON.stringify(telo),
      });
      const z = naZapisMimoPlan(zapis);
      if (!z) throw new Error('Nepodařilo se rozpoznat jídlo, zkus to prosím znovu nebo zadej ručně.');
      setOdhad(z);
      setHodnoty({ kcal: naText(z.kcal), protein: naText(z.protein), carbs: naText(z.carbs), fat: naText(z.fat) });
      setFaze('odhad');
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Odhad se nepodařil. Zkus to prosím znovu.');
      setFaze('vstup');
    }
  };

  const neplatnePole = POLE.filter(({ klic }) => {
    const n = naCislo(hodnoty[klic]);
    return !Number.isFinite(n) || n < 0 || (klic === 'kcal' ? n > 3000 : n > 400);
  }).map((p) => p.klic);

  const uloz = () => {
    if (!odhad || neplatnePole.length > 0) return;
    const upraveny: ZapisMimoPlan = {
      ...odhad,
      kcal: Math.round(naCislo(hodnoty.kcal)),
      protein: Math.round(naCislo(hodnoty.protein) * 10) / 10,
      carbs: Math.round(naCislo(hodnoty.carbs) * 10) / 10,
      fat: Math.round(naCislo(hodnoty.fat) * 10) / 10,
    };
    const zmeneno = POLE.some(({ klic }) => upraveny[klic] !== odhad[klic]);
    onUlozit(odhad, zmeneno ? { ...upraveny, upraveno: true } : odhad, zmeneno);
  };

  const zahod = async () => {
    if (!odhad) return;
    setZahazuji(true);
    setChyba(null);
    try {
      await apiFetch(`/api/nutrition/quick-log/${odhad.id}`, { method: 'DELETE' });
      onZavri();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Zápis se nepodařilo zahodit.');
      setZahazuji(false);
    }
  };

  const lzeOdeslat = rezim === 'foto' ? Boolean(foto) && !zpracovavam : popis.trim().length > 0;
  const lzeZavrit = faze === 'vstup';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={lzeZavrit ? onZavri : undefined}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mimo-plan-nadpis"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 w-full sm:max-w-md max-h-[90dvh] bg-povrch rounded-t-3xl sm:rounded-3xl border border-slate-800 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
          <h2 id="mimo-plan-nadpis" className="text-base font-bold text-white">Zapsat mimo plán</h2>
          {lzeZavrit && (
            <button
              type="button"
              onClick={onZavri}
              aria-label="Zavřít"
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {faze === 'vstup' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['foto', 'text'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setRezim(r); setChyba(null); }}
                    aria-pressed={rezim === r}
                    className={`min-h-11 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 ${
                      rezim === r
                        ? 'bg-cyan-950/70 text-akcent-cyan border-cyan-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {r === 'foto' ? <Camera className="w-3.5 h-3.5" /> : <Type className="w-3.5 h-3.5" />}
                    <span>{r === 'foto' ? 'Fotka' : 'Popis'}</span>
                  </button>
                ))}
              </div>

              {rezim === 'foto' ? (
                <div className="space-y-2">
                  {foto && (
                    <img src={foto} alt="Fotka jídla" className="w-full max-h-72 object-cover rounded-2xl border border-slate-800" />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer hover:border-cyan-500/50">
                      {zpracovavam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      <span>Vyfotit</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => { vyberFotku(e.target.files); e.target.value = ''; }}
                      />
                    </label>
                    <label className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer hover:border-cyan-500/50">
                      <ImagePlus className="w-4 h-4" />
                      <span>Z galerie</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => { vyberFotku(e.target.files); e.target.value = ''; }}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="mimo-plan-popis" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Co jsi snědl/a
                  </label>
                  <textarea
                    id="mimo-plan-popis"
                    value={popis}
                    onChange={(e) => setPopis(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Např. dva rohlíky se šunkou a sýrem, kafe s mlékem"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600"
                  />
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                Kalorie a makra odhadne AI. Než zápis uložíš, můžeš čísla opravit.
              </p>

              {chyba && (
                <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{chyba}</span>
                </div>
              )}

              <button
                type="button"
                onClick={odesli}
                disabled={!lzeOdeslat}
                className="w-full min-h-11 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 inline-flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Odhadnout</span>
              </button>
            </>
          )}

          {faze === 'cekam' && (
            <div className="py-10 flex flex-col items-center gap-3 text-center" aria-live="polite">
              {foto && rezim === 'foto' && (
                <img src={foto} alt="" className="w-32 h-32 object-cover rounded-2xl border border-slate-800 opacity-70" />
              )}
              <Loader2 className="w-7 h-7 text-akcent-cyan animate-spin" />
              <p className="text-sm text-slate-200">Odhaduju kalorie a makra…</p>
              <p className="text-[11px] text-slate-500">Obvykle to trvá pár sekund.</p>
            </div>
          )}

          {faze === 'odhad' && odhad && (
            <>
              {foto && odhad.zdroj === 'foto' && (
                <img src={foto} alt="Fotka jídla" className="w-full max-h-60 object-cover rounded-2xl border border-slate-800" />
              )}

              <div className="space-y-1">
                <p className="text-sm font-bold text-white">{odhad.popis || 'Jídlo mimo plán'}</p>
                {odhad.jistota && (
                  <p className={`text-[11px] ${odhad.jistota === 'low' ? 'text-amber-300' : 'text-slate-400'}`}>
                    {POPIS_JISTOTY[odhad.jistota]}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {POLE.map(({ klic, label, jednotka }) => (
                  <div key={klic}>
                    <label htmlFor={`mimo-plan-${klic}`} className="block text-[11px] font-semibold text-slate-500 mb-1">
                      {label} ({jednotka})
                    </label>
                    <input
                      id={`mimo-plan-${klic}`}
                      type="text"
                      inputMode="decimal"
                      value={hodnoty[klic]}
                      onChange={(e) => setHodnoty((h) => ({ ...h, [klic]: e.target.value }))}
                      aria-invalid={neplatnePole.includes(klic)}
                      className={`w-full min-h-11 px-3 rounded-xl bg-slate-950 border text-sm font-bold text-white ${
                        neplatnePole.includes(klic) ? 'border-red-500/60' : 'border-slate-800'
                      }`}
                    />
                  </div>
                ))}
              </div>

              {neplatnePole.length > 0 && (
                <p className="text-[11px] text-red-400">Kalorie 0–3000, gramy 0–400.</p>
              )}

              {chyba && (
                <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{chyba}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={zahod}
                  disabled={zahazuji}
                  className="min-h-11 rounded-xl text-sm font-bold text-slate-300 bg-slate-900 border border-slate-700 inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {zahazuji ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>Zahodit</span>
                </button>
                <button
                  type="button"
                  onClick={uloz}
                  disabled={zahazuji || neplatnePole.length > 0}
                  className="min-h-11 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 inline-flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Uložit</span>
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
