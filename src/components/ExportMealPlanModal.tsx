import React from 'react';
import { X, Download, Printer, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { ExerciseItem, MealItem, UserProfile } from '../types';
import { datumCesky, dnesekPraha } from '../data/adaptery';
import { postupProJidlo, soucetKcalPlanu } from '../lib/exportJidelnicku';

interface ExportMealPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Jídla dne, který se má vytisknout. Dnes vždy dnešek — App.tsx posílá
      `meals` (naJidla(plan)), ne den vybraný v přepínači záložek jídelníčku. */
  meals: MealItem[];
  /** Cviky dnešního tréninku (App.tsx posílá todayWorkout.exercises). Prázdné
      pole = žádná tréninková sekce v dokumentu — den volna není chyba. */
  exercises?: ExerciseItem[];
  profile: UserProfile;
}

export const ExportMealPlanModal: React.FC<ExportMealPlanModalProps> = ({
  isOpen,
  onClose,
  meals,
  exercises = [],
  profile
}) => {
  if (!isOpen) return null;

  // Obě tlačítka dělají totéž — otevřou tiskový dialog prohlížeče, kde je
  // "Uložit jako PDF" jako cíl. Žádný jsPDF, žádná atrapa, jedna cesta.
  const handlePrint = () => {
    window.print();
  };

  const planTotalKcal = soucetKcalPlanu(meals);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-povrch rounded-3xl border border-cyan-500/40 shadow-[0_0_50px_rgba(0,242,254,0.2)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-hlavicka-tmava-od to-povrch">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-akcent-cyan">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Export &amp; Tisk jídelníčku a tréninku (PDF)
              </h3>
              <p className="text-xs text-slate-400">
                Oficiální výživový plán Body &amp; Mind ON pro klienta {profile.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Document Preview */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          <div id="tiskovy-dokument" className="p-5 rounded-2xl bg-white text-slate-900 shadow-xl border border-slate-200 text-xs space-y-4">
            {/* Document Header */}
            <div className="flex items-start justify-between border-b pb-3 border-slate-200">
              <div>
                <div className="text-base font-extrabold tracking-tight text-slate-950 flex items-center gap-1">
                  <span>BODY &amp; MIND</span>
                  <span className="text-emerald-600">ON</span>
                </div>
                {/* „Protokol: Hypertrofická faze & Optimalizace kompozice" bylo
                    natvrdo pro kazdeho — zadne pole s nazvem protokolu nemame. */}
              </div>
              <div className="text-right text-[11px] text-slate-600">
                <div className="font-bold text-slate-900">{profile.name}</div>
                {/* `meals` je vždy dnešek (App.tsx posílá naJidla(plan), ne den
                    z přepínače záložek jídelníčku) — datum dnešního dne je tu
                    proto správně, ne natvrdo mimo to, co se skutečně tiskne. */}
                <div>Datum: {datumCesky(dnesekPraha())}</div>
                <div>Plán celkem: {planTotalKcal} kcal</div>
              </div>
            </div>

            {/* Meals Table in PDF preview */}
            <div className="space-y-3">
              {meals.map((m) => {
                const postup = postupProJidlo(m);
                return (
                  <div key={m.id} className="jidlo p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex justify-between font-bold text-slate-900 text-xs mb-1">
                      <span>{m.type} ({m.time}) - {m.title}</span>
                      <span className="text-emerald-700">{m.calories} kcal (B: {m.protein}g, S: {m.carbs}g, T: {m.fat}g)</span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Suroviny: {m.ingredients.join(', ')}
                    </div>
                    {/* Bez receptu nebo bez kroků se nekreslí nic — žádné
                        "Postup není k dispozici" (docs/DALSI_KROK.md 9.9). */}
                    {postup && (
                      <div className="text-[11px] text-slate-600 mt-1.5">
                        {postup.prepTimeMin != null && (
                          <div className="font-semibold text-slate-700">Příprava: {postup.prepTimeMin} min</div>
                        )}
                        <ol className="list-decimal list-inside mt-0.5 space-y-0.5">
                          {postup.kroky.map((krok, idx) => (
                            <li key={idx}>{krok}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Trénink dne — postup a obtížnost stejným vzorem jako u jídel:
                bez kroků/obtížnosti se nekreslí nic, žádný placeholder.
                Den volna (žádné cviky) sekci prostě nemá, není to chyba. */}
            {exercises.length > 0 && (
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div className="text-xs font-extrabold text-slate-900">Trénink dne</div>
                {exercises.map((ex) => (
                  <div key={ex.id} className="cvik p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex justify-between font-bold text-slate-900 text-xs mb-1">
                      <span>{ex.name}</span>
                      <span className="text-emerald-700">
                        {ex.sets} × {ex.reps}
                        {ex.obtiznost && ` · ${ex.obtiznost}`}
                      </span>
                    </div>
                    {ex.postup && ex.postup.length > 0 && (
                      <ol className="list-decimal list-inside mt-0.5 space-y-0.5 text-[11px] text-slate-600">
                        {ex.postup.map((krok, idx) => (
                          <li key={idx}>{krok}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Document Footer */}
            <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
              <span>Vygenerováno v Body &amp; Mind ON</span>
              <span>Body &amp; Mind ON © 2026</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/40 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              <span>Tisknout</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Zavřít
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(57,255,20,0.3)] active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Uložit jako PDF</span>
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 text-right">
            V tiskovém dialogu vyber cíl Uložit jako PDF.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
