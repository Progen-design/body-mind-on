import React, { useState } from 'react';
import { X, Scale, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { CHYBA_VAHY, overVahu } from '../../lib/vahaMeze.js';

interface AddMeasurementModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Uloží váhu na server. Vrací true při úspěchu. */
  onSave: (vahaKg: number) => Promise<boolean>;
  /** Poslední naměřená váha — jen jako nápověda v poli, nepředvyplňuje se. */
  latestWeight?: number | null;
}

/**
 * TUK A SVALOVÁ HMOTA TU NEJSOU SCHVÁLNĚ.
 *
 * Modál je ptal a nikam je neukládal: /api/quick-weight bere jen `weight_kg`
 * a /api/body-measurements zná obvody, ne podíl tuku. Uživatel je vyplňoval
 * s tím, že se zapíšou, a ony zmizely. Poznámka je pryč ze stejného důvodu —
 * quick-weight žádné pole pro ni nemá.
 *
 * Zmizelo i dopočítané BMI: počítalo se z výšky natvrdo zadané jako 1,82 m
 * bez ohledu na to, kdo měření zadává.
 */
export const AddMeasurementModal: React.FC<AddMeasurementModalProps> = ({
  isOpen,
  onClose,
  onSave,
  latestWeight = null
}) => {
  const [weight, setWeight] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [uklada, setUklada] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uklada) return;

    const overeno = overVahu(weight);
    if (!overeno.ok) {
      setChyba(overeno.chyba || CHYBA_VAHY);
      return;
    }

    setChyba(null);
    setUklada(true);
    const ok = await onSave(overeno.kg);
    setUklada(false);

    if (ok) {
      setWeight('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={uklada ? undefined : onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-md bg-[#0c1017] rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,242,254,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Zapsat váhu</h3>
              <p className="text-xs text-slate-400">Promítne se do grafu tělesného vývoje</p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={uklada}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div>
            <label htmlFor="vaha-kg" className="text-xs font-semibold text-slate-300 block mb-1.5">
              Váha (kg)
            </label>
            <input
              id="vaha-kg"
              type="number"
              step="0.1"
              inputMode="decimal"
              autoFocus
              required
              disabled={uklada}
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                if (chyba) setChyba(null);
              }}
              placeholder={latestWeight ? `Naposledy ${String(latestWeight).replace('.', ',')}` : ''}
              className={`w-full bg-slate-900/90 border focus:outline-none rounded-xl px-3 py-2.5 text-sm font-bold text-white shadow-inner disabled:opacity-60 ${
                chyba ? 'border-red-500/60' : 'border-slate-700 focus:border-[#00f2fe]'
              }`}
            />
            {chyba && <p className="text-[11px] text-red-400 mt-1.5">{chyba}</p>}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={uklada}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 disabled:opacity-50"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={uklada}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#39ff14] hover:opacity-95 shadow-[0_0_15px_rgba(0,242,254,0.3)] cursor-pointer disabled:opacity-60"
            >
              {uklada && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{uklada ? 'Ukládám…' : 'Uložit váhu'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
