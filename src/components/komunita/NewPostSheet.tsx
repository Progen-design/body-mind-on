import React, { useEffect, useState } from 'react';
import { X, ImagePlus, Loader2, Lock, Users, AlertTriangle, ShieldCheck } from 'lucide-react';
import { motion, useDragControls, type PanInfo } from 'motion/react';
import { apiFetch } from '../../lib/api';
import { zmensFotku } from '../../lib/zmensFotku';
import { PravidlaKomunity } from './PravidlaKomunity';
import { KomunitaKategorie, KomunitaPrispevek, MAX_FOTEK } from './typy';

/**
 * NOVÝ PŘÍSPĚVEK — spodní sheet, běžný příspěvek nebo check-in.
 *
 * Vysune se zdola, zabere nejvýš 90 % výšky a zavře se tažením za úchyt
 * dolů — jako každý sheet v telefonu. Táhne se jen za hlavičku, ať se
 * posun obsahu nepere se zavíráním.
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
  /** Prázdný feed otevírá rovnou check-in. */
  vychoziTyp?: 'text' | 'checkin';
  onZavri: () => void;
  onUlozeno: (prispevek: KomunitaPrispevek) => void;
}

export const NewPostSheet: React.FC<Props> = ({
  kategorie,
  vychoziKategorieId,
  posledniVahaKg,
  vychoziTyp,
  onZavri,
  onUlozeno,
}) => {
  const progresId = kategorie.find((k) => k.slug === 'muj-progres')?.id ?? null;
  const tah = useDragControls();

  const [typ, setTyp] = useState<'text' | 'checkin'>(
    vychoziTyp ?? (vychoziKategorieId && vychoziKategorieId === progresId ? 'checkin' : 'text'),
  );
  const [kategorieId, setKategorieId] = useState<string | null>(vychoziKategorieId ?? null);
  const [text, setText] = useState('');
  const [vaha, setVaha] = useState<string>(posledniVahaKg != null ? String(posledniVahaKg) : '');
  const [fotky, setFotky] = useState<string[]>([]);
  const [sdilet, setSdilet] = useState(true);
  const [uklada, setUklada] = useState(false);
  const [zpracovavaFotky, setZpracovavaFotky] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  // SOUHLAS SE BERE AŽ PŘED PRVNÍM PŘÍSPĚVKEM, ne při registraci — kdo do
  // komunity nikdy nenapíše, nemá co odsouhlasovat. Checkbox se objeví až
  // tehdy, když server řekne `needs_consent`; kdo souhlas dal, ho nevidí.
  const [potrebujeSouhlas, setPotrebujeSouhlas] = useState(false);
  const [souhlasZaskrtnut, setSouhlasZaskrtnut] = useState(false);
  const [pravidlaOtevrena, setPravidlaOtevrena] = useState(false);

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
          souhlas_s_pravidly: souhlasZaskrtnut || undefined,
        }),
      });
      onUlozeno(odpoved.topic);
    } catch (err) {
      // 403 s `needs_consent` není chyba uživatele — je to pokyn ukázat
      // zaškrtávátko. Rozhodnutí patří serveru, klient si ho nedomýšlí.
      const potreba = (err as { needs_consent?: boolean })?.needs_consent === true
        || (err instanceof Error && /pravidla komunity/i.test(err.message));
      if (potreba) {
        setPotrebujeSouhlas(true);
        setChyba('Nejdřív potvrď pravidla komunity.');
      } else {
        setChyba(err instanceof Error ? err.message : 'Příspěvek se nepodařilo uložit.');
      }
    } finally {
      setUklada(false);
    }
  };

  const nelzeUlozit = uklada
    || zpracovavaFotky
    || (potrebujeSouhlas && !souhlasZaskrtnut)
    || (typ === 'text' && text.trim().length === 0)
    || (typ === 'checkin' && text.trim().length === 0 && fotky.length === 0 && vaha.trim().length === 0);

  const konecTahu = (_: unknown, info: PanInfo) => {
    // Zavře buď dost dlouhý tah, nebo rychlé švihnutí dolů.
    if (info.offset.y > 120 || info.velocity.y > 600) onZavri();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onZavri}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="novy-prispevek-nadpis"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        drag="y"
        dragControls={tah}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={konecTahu}
        className="relative z-10 w-full sm:max-w-lg max-h-[90dvh] bg-povrch rounded-t-3xl border border-b-0 border-slate-800 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
      >
        <div
          onPointerDown={(e) => tah.start(e)}
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing border-b border-slate-800"
        >
          <div className="mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-slate-700" aria-hidden="true" />
          <div className="px-4 sm:px-5 py-2.5 flex items-center justify-between">
            <h2 id="novy-prispevek-nadpis" className="text-base font-bold text-white">Nový příspěvek</h2>
            <button
              type="button"
              onClick={onZavri}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Zavřít"
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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

          <div role="group" aria-labelledby="komunita-kategorie">
            <span id="komunita-kategorie" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Kategorie
            </span>
            {/* Check-in patří do „Můj progres" — ostatní chipy jsou pak zamčené. */}
            <div className="flex flex-wrap gap-2">
              {[{ id: null, name: 'Bez kategorie' }, ...kategorie].map((k) => {
                const aktivni = kategorieId === k.id;
                const zamceno = typ === 'checkin' && Boolean(progresId) && k.id !== progresId;
                return (
                  <button
                    key={k.id ?? 'zadna'}
                    type="button"
                    onClick={() => setKategorieId(k.id)}
                    disabled={zamceno}
                    aria-pressed={aktivni}
                    className={`min-h-9 px-3.5 rounded-full text-xs font-semibold border transition-all disabled:opacity-40 ${
                      aktivni
                        ? 'bg-cyan-950/70 text-akcent-cyan border-cyan-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {k.name}
                  </button>
                );
              })}
            </div>
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

          {potrebujeSouhlas && (
            <div className="p-3 rounded-2xl bg-slate-900/70 border border-cyan-500/30 space-y-2">
              <label className="flex items-start gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={souhlasZaskrtnut}
                  onChange={(e) => setSouhlasZaskrtnut(e.target.checked)}
                  className="mt-0.5 accent-cyan-400 w-4 h-4"
                />
                <span>Souhlasím s pravidly komunity</span>
              </label>
              <button
                type="button"
                onClick={() => setPravidlaOtevrena(true)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-akcent-cyan"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Přečíst pravidla</span>
              </button>
            </div>
          )}

          {chyba && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{chyba}</span>
            </div>
          )}
        </div>

        {pravidlaOtevrena && <PravidlaKomunity onZavri={() => setPravidlaOtevrena(false)} />}

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-900/40 shrink-0">
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
