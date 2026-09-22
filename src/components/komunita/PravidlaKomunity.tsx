import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

/**
 * PRAVIDLA KOMUNITY — pět vět, ne stránka právního textu.
 *
 * Text je statický a schválně krátký: pravidla, která nikdo nedočte, nikdo
 * nedodrží. Tón drží `docs/copy-rules.md` — říkáme, co nechceme a proč, ne
 * co „je zakázáno dle podmínek".
 *
 * Dvě z pěti nejsou o slušnosti, ale o bezpečí: v appce o hubnutí se rady
 * typu „ber tohle" a „jez 800 kcal" šíří samy a můžou někomu ublížit. Proto
 * stojí první.
 */
export const PRAVIDLA = [
  {
    nadpis: 'Žádné diagnózy a léčebné rady',
    text: 'Neurčuj druhým, co jim je, ani co mají brát. Na to je lékař, ne komunita.',
  },
  {
    nadpis: 'Žádné extrémní diety',
    text: 'Hladovky, detoxy a „minus 10 kg za týden" tu nemají místo. Komu to ublíží, ten se nevrátí.',
  },
  {
    nadpis: 'Respekt',
    text: 'Každý je někde jinde a začátek vypadá různě. Posměch a poučování si nech pro sebe.',
  },
  {
    nadpis: 'Žádná reklama',
    text: 'Doplňky, kódy na slevu a odkazy na vlastní byznys sem nepatří.',
  },
  {
    nadpis: 'Fotky jen vlastní',
    text: 'Sdílej svoje fotky, ne cizí. Fotku někoho jiného tu mít nesmíš.',
  },
] as const;

interface Props {
  onZavri: () => void;
}

export const PravidlaKomunity: React.FC<Props> = ({ onZavri }) => (
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
      role="dialog"
      aria-label="Pravidla komunity"
      className="relative z-10 w-full sm:max-w-lg max-h-[92vh] bg-povrch rounded-t-3xl sm:rounded-3xl border border-slate-800 flex flex-col overflow-hidden"
    >
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-akcent-cyan">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h2 className="text-base font-bold text-white">Pravidla komunity</h2>
        </div>
        <button
          type="button"
          onClick={onZavri}
          aria-label="Zavřít"
          className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ol className="p-4 sm:p-5 space-y-3 overflow-y-auto">
        {PRAVIDLA.map((p, i) => (
          <li key={p.nadpis} className="flex gap-3">
            <span className="w-6 h-6 shrink-0 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-[11px] font-bold text-slate-300">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">{p.nadpis}</div>
              <p className="text-xs text-slate-400 leading-relaxed">{p.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="p-4 border-t border-slate-800 bg-slate-900/40 shrink-0">
        <p className="text-[11px] text-slate-500">
          Co pravidla porušuje, můžeš nahlásit vlajkou u příspěvku nebo odpovědi.
        </p>
      </div>
    </motion.div>
  </div>
);
