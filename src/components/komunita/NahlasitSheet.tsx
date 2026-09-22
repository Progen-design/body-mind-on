import React, { useState } from 'react';
import { X, Flag, Loader2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '../../lib/api';
import { DUVODY_NAHLASENI } from './typy';

/**
 * NAHLÁŠENÍ OBSAHU.
 *
 * Důvod se vybírá ze seznamu, volný text je doplněk. Z pěti slov se
 * moderuje líp než z prázdného pole — a u „Jiné" je text jediné, co
 * o problému víme, takže se tam vyžaduje.
 *
 * Duplicitu server vrací jako úspěch (200), ne chybu: dvojklik ani
 * nahlášení téhož z detailu i ze seznamu není chyba uživatele.
 */
interface Props {
  postId?: string | null;
  replyId?: string | null;
  onZavri: () => void;
  onHotovo: () => void;
}

export const NahlasitSheet: React.FC<Props> = ({ postId, replyId, onZavri, onHotovo }) => {
  const [duvod, setDuvod] = useState<string>(DUVODY_NAHLASENI[0].id);
  const [text, setText] = useState('');
  const [odesila, setOdesila] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const popisek = DUVODY_NAHLASENI.find((d) => d.id === duvod)?.label ?? '';
  const nutnyText = duvod === 'jine';
  const nelzeOdeslat = odesila || (nutnyText && text.trim().length === 0);

  const odesli = async () => {
    setOdesila(true);
    setChyba(null);
    try {
      await apiFetch('/api/community/report', {
        method: 'POST',
        body: JSON.stringify({
          post_id: postId ?? null,
          reply_id: replyId ?? null,
          // Server dostane důvod jedním řetězcem — moderace čte větu,
          // ne kód, který by si musela překládat.
          reason: text.trim() ? `${popisek}: ${text.trim()}` : popisek,
        }),
      });
      onHotovo();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Nahlášení se nepodařilo odeslat.');
      setOdesila(false);
    }
  };

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
        role="dialog"
        aria-label="Nahlásit obsah"
        className="relative z-10 w-full sm:max-w-md bg-povrch rounded-t-3xl sm:rounded-3xl border border-slate-800 flex flex-col overflow-hidden"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <Flag className="w-4 h-4 text-amber-300" />
            <h2 className="text-base font-bold text-white">Nahlásit</h2>
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

        <div className="p-4 space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Co je špatně?
            </legend>
            {DUVODY_NAHLASENI.map((d) => (
              <label
                key={d.id}
                className={`flex items-center gap-2.5 min-h-11 px-3 rounded-xl border cursor-pointer text-sm ${
                  duvod === d.id
                    ? 'bg-cyan-950/50 text-akcent-cyan border-cyan-500/50'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="duvod-nahlaseni"
                  value={d.id}
                  checked={duvod === d.id}
                  onChange={() => setDuvod(d.id)}
                  className="accent-cyan-400"
                />
                <span>{d.label}</span>
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="nahlaseni-text" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              {nutnyText ? 'Napiš, co se stalo' : 'Doplň (nepovinné)'}
            </label>
            <textarea
              id="nahlaseni-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={400}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600"
            />
          </div>

          {chyba && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{chyba}</span>
            </div>
          )}

          <button
            type="button"
            onClick={odesli}
            disabled={nelzeOdeslat}
            className="w-full min-h-11 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 flex items-center justify-center gap-2"
          >
            {odesila && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{odesila ? 'Odesílám…' : 'Odeslat nahlášení'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
