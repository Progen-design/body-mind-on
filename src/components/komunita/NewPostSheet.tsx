import React, { useEffect, useState } from 'react';
import { X, ImagePlus, Loader2, Lock, Users, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '../../lib/api';
import { zmensFotku } from '../../lib/zmensFotku';
import { KomunitaKategorie, KomunitaPrispevek, MAX_FOTEK } from './typy';

/**
 * NOVÝ PŘÍSPĚVEK — běžný, nebo check-in.
 *
 * Check-in je fotka + váha + pár slov. Váha se předvyplní z posledního
 * vážení, aby ji nikdo nepřepisoval z hlavy; nechat ji prázdnou je taky
 * v pořádku, server ji doplní sám ze `body_measurements`.
 *
 * „Jen pro mě" (→ `is_hidden`) je tu proto, že fotky postavy chce spousta
 * lidí sledovat, ale ne ukazovat. Bez té volby by check-in znamenal buď
 * zveřejnit, nebo nedělat.
 */
interface Props {
  kategorie: KomunitaKategorie[];
  /** Kategorie, ve které uživatel zrovna je — předvyplní se. */
  vychoziKategorieId: string | null;
  posledniVahaKg: number | null;
  onZavri: () => void;
  onUlozeno: (prispevek: KomunitaPrispevek) => void;
}

export const NewPostSheet: React.FC<Props> = ({
  kategorie,
  vychoziKategorieId,
  posledniVahaKg,
  onZavri,
  onUlozeno,
}) => {
  const progresId = kategorie.find((k) => k.slug === 'muj-progres')?.id ?? null;

  const [typ, setTyp] = useState<'text' | 'checkin'>(
    vychoziKategorieId && vychoziKategorieId === progresId ? 'checkin' : 'text',
  );
  const [kategorieId, setKategorieId] = useState<string | null>(vychoziKategorieId ?? null);
  const [text, setText] = useState('');
  const [vaha, setVaha] = useState<string>(posledniVahaKg != null ? String(posledniVahaKg) : '');
  const [fotky, setFotky] = useState<string[]>([]);
  const [sdilet, setSdilet] = useState(true);
  const [uklada, setUklada] = useState(false);
  const [zpracovavaFotky, setZpracovavaFotky] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  // Check-in patří do „Můj progres" — přepnutím se kategorie srovná, aby
  // check-in neskončil v Tréninku.
  useEffect(() => {
    if (typ === 'checkin' && progresId) setKategorieId(progresId);
  }, [typ, progresId]);

  const pridejFotky = async (soubory: FileList | null) => {
    if (!soubory || soubory.length === 0) return;
    const volno = MAX_FOTEK - fotky.length;
    if (volno <= 0) {
      setChyba(`Víc než ${MAX_FOTEK} fotky k jednomu příspěvku nepřidáš.`);
      return;
    }

    setZpracovavaFotky(true);
    setChyba(null);
    try {
      const nove: string[] = [];
      for (const soubor of Array.from(soubory).slice(0, volno)) {
        nove.push(await zmensFotku(soubor));
      }
      setFotky((p) => [...p, ...nove]);
    } catch {
      setChyba('Fotku se nepodařilo načíst. Zkus jinou.');
    } finally {
      setZpracovavaFotky(false);
    }
  };

  const uloz = async () => {
    setUklada(true);
    setChyba(null);
    try {
      const vahaCislo = Number(vaha.replace(',', '.'));
      const odpoved = await apiFetch<{ topic: KomunitaPrispevek }>('/api/community', {
        method: 'POST',
        body: JSON.stringify({
          category_id: kategorieId,
          content: text.trim(),
          post_type: typ,
          weight_kg: typ === 'checkin' && Number.isFinite(vahaCislo) && vahaCislo > 0 ? vahaCislo : null,
          photos: fotky,
          is_hidden: !sdilet,
        }),
      });
      onUlozeno(odpoved.topic);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Příspěvek se nepodařilo uložit.');
    } finally {
      setUklada(false);
    }
  };

  const nelzeUlozit = uklada
    || zpracovavaFotky
    || (typ === 'text' && text.trim().length === 0)
    || (typ === 'checkin' && text.trim().length === 0 && fotky.length === 0 && vaha.trim().length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onZavri}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 w-full sm:max-w-lg max-h-[92vh] bg-povrch rounded-t-3xl sm:rounded-3xl border border-slate-800 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
      >
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
          <h2 className="text-base font-bold text-white">Nový příspěvek</h2>
          <button
            type="button"
            onClick={onZavri}
            aria-label="Zavřít"
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Typ příspěvku */}
          <div className="grid grid-cols-2 gap-2">
            {(['text', 'checkin'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTyp(t)}
                aria-pressed={typ === t}
                className={`min-h-11 rounded-xl text-xs font-bold border transition-all ${
                  typ === t
                    ? 'bg-cyan-950/70 text-akcent-cyan border-cyan-500/50'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {t === 'text' ? 'Běžný příspěvek' : 'Check-in'}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="komunita-kategorie" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Kategorie
            </label>
            <select
              id="komunita-kategorie"
              value={kategorieId ?? ''}
              onChange={(e) => setKategorieId(e.target.value || null)}
              disabled={typ === 'checkin' && Boolean(progresId)}
              className="w-full min-h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 disabled:opacity-60"
            >
              <option value="">Bez kategorie</option>
              {kategorie.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          </div>

          {typ === 'checkin' && (
            <div>
              <label htmlFor="komunita-vaha" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Váha (kg)
              </label>
              <input
                id="komunita-vaha"
                type="text"
                inputMode="decimal"
                value={vaha}
                onChange={(e) => setVaha(e.target.value)}
                placeholder={posledniVahaKg != null ? String(posledniVahaKg) : 'Nepovinné'}
                className="w-full min-h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {posledniVahaKg != null
                  ? 'Předvyplněno z posledního vážení. Přepiš, pokud sedí jinak.'
                  : 'Necháš-li prázdné, doplníme poslední vážení.'}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="komunita-text" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              {typ === 'checkin' ? 'Poznámka' : 'Text'}
            </label>
            <textarea
              id="komunita-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={typ === 'checkin' ? 'Jak ti bylo tenhle týden?' : 'Co chceš sdílet?'}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600"
            />
          </div>

          {/* Fotky */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Fotky
              </span>
              <span className="text-[11px] text-slate-500">{fotky.length} / {MAX_FOTEK}</span>
            </div>

            {fotky.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {fotky.map((f, i) => (
                  <div key={f.slice(-24) + i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-800">
                    <img src={f} alt={`Fotka ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFotky((p) => p.filter((_, idx) => idx !== i))}
                      aria-label={`Odebrat fotku ${i + 1}`}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/70 text-slate-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer hover:border-cyan-500/50">
              {zpracovavaFotky ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              <span>{zpracovavaFotky ? 'Zpracovávám…' : 'Přidat fotku'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                disabled={fotky.length >= MAX_FOTEK || zpracovavaFotky}
                onChange={(e) => {
                  pridejFotky(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {/* Sdílet / jen pro mě */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSdilet(true)}
              aria-pressed={sdilet}
              className={`min-h-11 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 ${
                sdilet ? 'bg-cyan-950/70 text-akcent-cyan border-cyan-500/50' : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Sdílet s komunitou</span>
            </button>
            <button
              type="button"
              onClick={() => setSdilet(false)}
              aria-pressed={!sdilet}
              className={`min-h-11 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 ${
                !sdilet ? 'bg-cyan-950/70 text-akcent-cyan border-cyan-500/50' : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Jen pro mě</span>
            </button>
          </div>

          {chyba && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{chyba}</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/40 shrink-0">
          <button
            type="button"
            onClick={uloz}
            disabled={nelzeUlozit}
            className="w-full min-h-11 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 flex items-center justify-center gap-2"
          >
            {uklada && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{uklada ? 'Ukládám…' : 'Přidat příspěvek'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
