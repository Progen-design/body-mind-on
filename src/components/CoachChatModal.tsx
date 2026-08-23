import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Brain, Send, User, Trash2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '../lib/api';

/**
 * CHAT S TEDEM.
 *
 * Do 23. 8. 2026 to byla atrapa: odpovědi byly natvrdo psané v tomhle souboru
 * (čtyři varianty podle klíčových slov), váha 104,6 kg a trénink „Ramena &
 * Triceps" tu stály jako výchozí hodnoty pro každého. Nic se nikam neposílalo.
 *
 * Teď jde otázka na `POST /api/coach-chat`, odtud do OpenAI přes `runAgent`
 * s kontextem složeným z profilu uživatele — jeho metriky, jeho plán, jeho
 * naměřená data. Historie žije v databázi, takže přežije refresh i přechod
 * na jiné zařízení.
 *
 * ŽÁDNÉ VÝCHOZÍ HODNOTY. Když data nejsou, TED to řekne. Vymyšlené číslo
 * v odpovědi trenéra je horší než přiznané „tohle u tebe nevidím".
 */

/** U čeho se uživatel ptá. Chat se pak otevře rovnou u toho čísla. */
export interface KotvaChatu {
  typ: 'metrika' | 'jidlo' | 'cvik' | 'pojem';
  klic: string;
  popis?: string;
  hodnota?: string;
}

interface Zprava {
  id: string;
  role: 'user' | 'ted';
  obsah: string;
  created_at: string;
}

interface CoachChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Předvyplněná otázka a ukotvení, když se chat otevřel od otazníku. */
  kotva?: KotvaChatu | null;
}

const NAVRHY = [
  'Co mi říkají moje data za poslední týden?',
  'Proč mám dnes v plánu zrovna tenhle trénink?',
  'Čím můžu nahradit jídlo, které mi nesedí?',
  'Na čem mám tenhle týden zapracovat?'
];

function cas(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

export const CoachChatModal: React.FC<CoachChatModalProps> = ({ isOpen, onClose, kotva = null }) => {
  const [zpravy, setZpravy] = useState<Zprava[]>([]);
  const [text, setText] = useState('');
  const [odesilam, setOdesilam] = useState(false);
  const [nacitam, setNacitam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const konec = useRef<HTMLDivElement>(null);
  const vstup = useRef<HTMLInputElement>(null);

  // Historie se načítá při otevření, ne při každém překreslení.
  useEffect(() => {
    if (!isOpen) return;
    let zive = true;
    setNacitam(true);
    setChyba(null);

    apiFetch<{ zpravy: Zprava[] }>('/api/coach-chat')
      .then((o) => { if (zive) setZpravy(o.zpravy ?? []); })
      .catch(() => { if (zive) setChyba('Historii se nepodařilo načíst. Psát můžeš dál.'); })
      .finally(() => { if (zive) setNacitam(false); });

    return () => { zive = false; };
  }, [isOpen]);

  // Otevření od otazníku předvyplní otázku k dané položce.
  useEffect(() => {
    if (!isOpen || !kotva) return;
    const popis = kotva.popis || kotva.klic;
    setText(kotva.hodnota ? `Co pro mě znamená ${popis} ${kotva.hodnota}?` : `Co pro mě znamená ${popis}?`);
    setTimeout(() => vstup.current?.focus(), 80);
  }, [isOpen, kotva]);

  useEffect(() => {
    if (isOpen) setTimeout(() => konec.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, [isOpen, zpravy, odesilam]);

  const odesli = useCallback(async (predvyplneno?: string) => {
    const otazka = (predvyplneno ?? text).trim();
    if (!otazka || odesilam) return;

    setChyba(null);
    setText('');
    setOdesilam(true);

    // Otázka se ukáže hned; server ji uloží až spolu s odpovědí.
    const docasne: Zprava = {
      id: `docasna-${Date.now()}`,
      role: 'user',
      obsah: otazka,
      created_at: new Date().toISOString()
    };
    setZpravy((p) => [...p, docasne]);

    try {
      const odpoved = await apiFetch<{ odpoved: string; zpravy?: Zprava[] }>('/api/coach-chat', {
        method: 'POST',
        body: JSON.stringify({ otazka, kontext: kotva ?? undefined })
      });

      setZpravy((p) => {
        const bezDocasne = p.filter((z) => z.id !== docasne.id);
        if (odpoved.zpravy?.length) return [...bezDocasne, ...odpoved.zpravy];
        return [
          ...bezDocasne,
          docasne,
          { id: `ted-${Date.now()}`, role: 'ted', obsah: odpoved.odpoved, created_at: new Date().toISOString() }
        ];
      });
    } catch (e) {
      // Otázka zpátky do pole, ať ji uživatel nemusí psát znovu.
      setZpravy((p) => p.filter((z) => z.id !== docasne.id));
      setText(otazka);
      setChyba(e instanceof Error ? e.message : 'Odeslání se nepovedlo.');
    } finally {
      setOdesilam(false);
    }
  }, [text, odesilam, kotva]);

  const smaz = useCallback(async () => {
    try {
      await apiFetch('/api/coach-chat', { method: 'DELETE' });
      setZpravy([]);
      setChyba(null);
    } catch {
      setChyba('Konverzaci se nepodařilo smazat.');
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-2xl h-[620px] max-h-[90vh] bg-[#0c1017] rounded-3xl border border-cyan-500/40 shadow-[0_0_50px_rgba(0,242,254,0.2)] flex flex-col overflow-hidden"
      >
        {/* Hlavička */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-[#00f2fe] shrink-0">
              <Brain className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">AI trenér TED</h3>
              {/* Žádné „Online" ani jméno cizího uživatele — obojí tu dřív bylo
                  natvrdo. Popisek říká, odkud TED bere data. */}
              <p className="text-xs text-slate-400 truncate">
                Odpovídá podle tvého profilu a naměřených dat
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {zpravy.length > 0 && (
              <button
                onClick={smaz}
                title="Smazat konverzaci"
                className="p-2 rounded-xl text-slate-500 hover:text-rose-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Zavřít"
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Konverzace */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 bg-[#090c12]/70">
          {nacitam && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Načítám konverzaci…</span>
            </div>
          )}

          {!nacitam && zpravy.length === 0 && (
            <div className="text-center py-8 px-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-[#00f2fe] mb-3">
                <Brain className="w-6 h-6" />
              </div>
              <p className="text-sm text-slate-300 mb-1">Zeptej se na cokoli ze svého plánu nebo měření.</p>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                TED vidí tvůj jídelníček, trénink, návyky a data z hodinek a váhy.
                Co v profilu nemáš, o tom ti neřekne — místo odhadu ti to napíše.
              </p>
            </div>
          )}

          {zpravy.map((z) => {
            const jeTed = z.role === 'ted';
            return (
              <div key={z.id} className={`flex items-start gap-2.5 ${jeTed ? 'justify-start' : 'justify-end'}`}>
                {jeTed && (
                  <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe] shrink-0 mt-0.5">
                    <Brain className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                    jeTed
                      ? 'bg-slate-900/90 text-slate-200 border border-slate-800 shadow-md'
                      : 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-950 font-medium'
                  }`}
                >
                  <p>{z.obsah}</p>
                  <div className={`text-[10px] mt-1.5 text-right ${jeTed ? 'text-slate-500' : 'text-cyan-950/70'}`}>
                    {cas(z.created_at)}
                  </div>
                </div>

                {!jeTed && (
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {odesilam && (
            <div className="flex items-center gap-2 text-xs text-cyan-400 pl-9">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>TED přemýšlí…</span>
            </div>
          )}

          {chyba && (
            <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl p-3">
              {chyba}
            </div>
          )}

          <div ref={konec} />
        </div>

        {/* Návrhy jen do prázdné konverzace — jinak zabírají místo. */}
        {zpravy.length === 0 && !nacitam && (
          <div className="p-3 bg-slate-950 border-t border-slate-800/80 overflow-x-auto flex gap-1.5">
            {NAVRHY.map((n) => (
              <button
                key={n}
                onClick={() => odesli(n)}
                disabled={odesilam}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 text-[11px] text-slate-300 hover:text-cyan-300 whitespace-nowrap transition-all disabled:opacity-50"
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {/* Vstup */}
        <div className="p-3.5 sm:p-4 bg-slate-900/60 border-t border-slate-800 flex items-center gap-2">
          <input
            ref={vstup}
            type="text"
            maxLength={1000}
            placeholder="Zeptej se TEDa na svůj plán, trénink nebo měření…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') odesli(); }}
            disabled={odesilam}
            className="flex-1 bg-slate-950 border border-slate-700 focus:border-[#00f2fe] focus:outline-none rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 disabled:opacity-60"
          />
          <button
            onClick={() => odesli()}
            disabled={!text.trim() || odesilam}
            aria-label="Odeslat"
            className="p-2.5 rounded-2xl bg-gradient-to-r from-[#00f2fe] to-[#39ff14] text-slate-950 hover:opacity-90 disabled:opacity-40 transition-all"
          >
            <Send className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
