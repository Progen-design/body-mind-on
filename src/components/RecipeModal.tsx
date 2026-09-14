import React, { useEffect, useState } from 'react';
import { X, Clock, CheckCircle2, Repeat } from 'lucide-react';
import { motion } from 'motion/react';
import { MealItem } from '../types';
import { jidloZPlanu } from '../data/adaptery';
import { apiFetch } from '../lib/api';

interface RecipeModalProps {
  meal: MealItem | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleComplete?: (id: string) => void;
  /**
   * Jídlo se zaměnilo na serveru. `noveJidlo` je poskládané rovnou z odpovědi
   * POST /api/plan-replace-meal (přes sdílený `jidloZPlanu`, stejný mapper
   * jako `mealyDne`) — App.tsx ho má hned vykreslit, bez čekání na
   * znovunačtení profilu. `souradnice` je pojistka pro to znovunačtení, které
   * pak běží na pozadí: až doběhne, App.tsx si přes `najdiJidloPodleSouradnic`
   * ověří/doplní čerstvá data ze skutečného zdroje pravdy (adaptér nad
   * `structured_plan_json`), pro případ, že by se odpověď endpointu a plán
   * v DB v něčem rozešly.
   */
  onPlanZmenen: (
    noveJidlo: MealItem,
    souradnice: { planId: string; planDay: number; poziceVPlanu: number }
  ) => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  meal,
  isOpen,
  onClose,
  onToggleComplete,
  onPlanZmenen
}) => {
  // ZÁMĚNA JÍDLA (POST /api/plan-replace-meal). Endpoint existoval od
  // začátku, ale UI na něj nevedlo — viz bývalý komentář níž u receptu.
  //
  // MODAL SE PO ÚSPĚCHU NEZAVÍRÁ A NEČEKÁ NA ZNOVUNAČTENÍ PROFILU. Nové jídlo
  // se poskládá rovnou z odpovědi endpointu (`jidloZPlanu`) a vykreslí hned —
  // endpoint od 15. 9. 2026 vrací jen zaměněné jídlo a jeho souřadnice, ne
  // celý týden (dřív 111,7 kB, klient z toho stejně nic nečetl). Přenačtení
  // profilu (`onPlanZmenen` → App.tsx) běží dál, ale na pozadí, jen jako
  // pojistka pro najdiJidloPodleSouradnic — UI na něj nečeká.
  const [meniSe, setMeniSe] = useState(false);
  const [chybaZmeny, setChybaZmeny] = useState<string | null>(null);

  // Jakmile prop `meal` doopravdy dorazí jiný (nové jídlo po záměně, nebo
  // uživatel otevřel jiné jídlo), „Hledám náhradu…" končí, kdyby ještě běželo.
  // Na chybu se tohle nevztahuje — ta meniSe vypíná sama v catch bloku.
  useEffect(() => {
    setMeniSe(false);
  }, [meal]);

  if (!isOpen || !meal) return null;

  const handleZmenitJidlo = async () => {
    if (meal.planId == null || meal.planDay == null || meal.poziceVPlanu == null) return;
    const souradnice = { planId: meal.planId, planDay: meal.planDay, poziceVPlanu: meal.poziceVPlanu };
    const puvodniTyp = meal.type;
    setMeniSe(true);
    setChybaZmeny(null);
    try {
      const odpoved = await apiFetch<{ meal: any }>('/api/plan-replace-meal', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: souradnice.planId,
          day_slot_index: souradnice.planDay,
          meal_index: souradnice.poziceVPlanu
        })
      });
      // `puvodniTyp` (ne dopočítaný): pozice ve dni se záměnou nemění, takže
      // typ (a u svačiny i pořadí dopolední/odpolední) zůstává stejný jako
      // u jídla, které se nahrazuje — viz komentář u jidloZPlanu.
      const noveJidlo: MealItem = {
        ...jidloZPlanu(
          odpoved.meal,
          puvodniTyp,
          souradnice.poziceVPlanu,
          meal.id,
          souradnice.planId,
          souradnice.planDay
        ),
        // jidloZPlanu vrací vždy completed:false (odškrtnutí je overlay, co
        // dělá až volající — pouzijDokonceni v App.tsx, po znovunačtení).
        // Dokud to znovunačtení na pozadí nedoběhne, přebírá se stav ze
        // stejné pozice PŘED záměnou — activityKey se záměnou nemění, takže
        // „splněno" dnešního slotu se nemá zapomenout jen proto, že se
        // vykresluje dřív, než dorazí čerstvý přehled.
        completed: meal.completed
      };
      onPlanZmenen(noveJidlo, souradnice);
    } catch (chyba: any) {
      // 409 NO_ALTERNATIVE / DAY_KCAL_OUT_OF_TOLERANCE nesou hotovou českou
      // hlášku — zobrazuje se přesně tak, jak přišla, nic se nepřepisuje.
      // Modal zůstává otevřený na PŮVODNÍM jídle, ne prázdný — hláška bez
      // kontextu, k čemu se vztahuje, je k ničemu.
      setChybaZmeny(chyba?.message || 'Nepodařilo se jídlo vyměnit.');
      setMeniSe(false);
    }
  };

  // Žádný náhradní recept. Dřív tu stály čtyři věty („Připravte si všechny
  // čerstvé suroviny podle gramáže." …), které se ukázaly u každého jídla bez
  // rozdílu, plus vymyšlená náročnost, tip a seznam záměn. Když postup není,
  // sekce se nevykreslí — prázdná sekce ani „—" u receptu nedávají smysl.
  const recipe = meal.recipe ?? null;

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
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-start justify-between bg-gradient-to-r from-hlavicka-tmava-od to-povrch">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-cyan-950 text-akcent-cyan border border-cyan-500/40">
                {meal.type} • {meal.time}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {meal.title}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        {/* Během záměny vizuálně neaktivní (opacity + pointer-events-none) —
            ať není vidět blik starého jídla, než dorazí přenačtená data
            (viz handleZmenitJidlo výš). */}
        <div
          className={`p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 transition-opacity ${
            meniSe ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          {/* Quick Metrics Bar (Calories & Macros) */}
          <div className="grid grid-cols-4 gap-2.5 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
            <div>
              <span className="text-[11px] text-slate-400 font-semibold block">Kalorie</span>
              <span className="text-base sm:text-lg font-black text-amber-400">{meal.calories} kcal</span>
            </div>
            <div>
              <span className="text-[11px] text-makro-bilkoviny font-semibold block">Bílkoviny</span>
              <span className="text-base sm:text-lg font-black text-white">{meal.protein} g</span>
            </div>
            <div>
              <span className="text-[11px] text-makro-sacharidy font-semibold block">Sacharidy</span>
              <span className="text-base sm:text-lg font-black text-white">{meal.carbs} g</span>
            </div>
            <div>
              <span className="text-[11px] text-makro-tuky font-semibold block">Tuky</span>
              <span className="text-base sm:text-lg font-black text-white">{meal.fat} g</span>
            </div>
          </div>

          {/* Doba pripravy. Jen odhad z prep_minutes_estimated — ready_in_minutes
              je v katalogu prazdny u vsech receptu, ktere se v planech objevuji,
              takze "Vareni/peceni: 15 min" nemelo z ceho vzniknout. */}
          {recipe?.prepTimeMin != null && (
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Příprava: <strong>zhruba {recipe.prepTimeMin} min</strong></span>
            </div>
          )}

          {/* Ingredients list */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <span>Suroviny (Přesná gramáž)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {meal.ingredients.map((ing, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-medium text-slate-200"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-akcent-cyan" />
                  <span>{ing}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Postup. Bez skutecnych kroku se sekce nezobrazi vubec. */}
          {recipe && recipe.instructions.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
              Postup přípravy krok za krokem
            </h4>
            <div className="space-y-3">
              {recipe.instructions.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs sm:text-sm">
                  <div className="w-6 h-6 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-akcent-cyan font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-slate-300 leading-relaxed pt-0.5">{step}</p>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Pryc "Nutricni tip AI Trenera" a "Mozne alternativy a zameny".
              Obojí bylo jednou vetou natvrdo pro vsechna jidla a v databazi pro
              ne neni zadne pole. Zamena jidla (api/plan-replace-meal.js) je
              tlacitko "Dat si neco jineho" v patičce niz. */}

          {chybaZmeny && (
            <p className="text-xs text-rose-400">{chybaZmeny}</p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 transition-all"
          >
            Zavřít
          </button>

          <div className="flex items-center gap-2">
            {/* DÁT SI NĚCO JINÉHO (POST /api/plan-replace-meal). Podmínka je
                na `poziceVPlanu`: bez ní nemá požadavek adresu a poslat ho
                naslepo by přepsalo cizí jídlo. Seed data v initialData.ts
                ho nemají, takže tlačítko u ukázkových dat nikdy neuvidí. */}
            {meal.planId != null && meal.planDay != null && meal.poziceVPlanu != null && (
              <button
                onClick={handleZmenitJidlo}
                disabled={meniSe}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-950 border border-slate-800 hover:border-cyan-500/40 disabled:opacity-50 transition-all"
                title="Nahradit tohle jídlo jiným ze stejného typu"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>{meniSe ? 'Hledám náhradu…' : 'Dát si něco jiného'}</span>
              </button>
            )}

            {onToggleComplete && (
              <button
                onClick={() => {
                  onToggleComplete(meal.id);
                  onClose();
                }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  meal.completed
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(57,255,20,0.3)]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{meal.completed ? 'Označit jako nesnědeno' : 'Označit jako snědeno (+ ' + meal.calories + ' kcal)'}</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
