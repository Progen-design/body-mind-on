import React, { useCallback, useEffect, useState } from 'react';
import {
  Shield,
  Loader2,
  Send,
  EyeOff,
  Eye,
  Trash2,
  Check,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { sklonuj } from './feedLogika';
import { KomunitaOdpoved } from './typy';

/**
 * PANEL MODERACE — vidí ho jen moderátor.
 *
 * Je v komunitě, ne na admin stránce: kdo moderuje, čte tytéž příspěvky
 * jako ostatní a přepínat kvůli jednomu skrytí obrazovku znamená, že se to
 * neudělá. Panel se ukáže podle `is_admin` z `GET /api/community`, ale
 * oprávnění si každý endpoint ověřuje sám — příznak je jen UI.
 *
 * Dvě záložky, protože jsou to dvě různé práce: dotazy se odpovídají,
 * nahlášení se vyřizují. V jednom seznamu by se ta nepříjemnější odbyla.
 *
 * Ve feedu je sbalený do jednoho řádku s počty — moderátor je taky čtenář
 * a panel přes půl obrazovky by mu feed zakryl. Data se tahají hned, ať
 * počty v řádku sedí i bez rozbalení.
 */
const ENDPOINT = '/api/community/moderace';

interface Nahlaseni {
  id: string;
  typ: 'prispevek' | 'odpoved';
  reason: string | null;
  created_at: string;
  existuje: boolean;
  author_name: string | null;
  is_hidden: boolean | null;
  nahled: string | null;
}

interface Dotaz {
  id: string;
  author_name: string | null;
  created_at: string;
  reply_count: number;
  nahled: string | null;
}

type Akce = 'hide' | 'unhide' | 'delete' | 'resolve';

interface Props {
  /** Po zásahu moderace se seznam příspěvků musí načíst znovu. */
  onZmena: () => void;
}

export const PanelModerace: React.FC<Props> = ({ onZmena }) => {
  const [rozbaleno, setRozbaleno] = useState(false);
  const [zalozka, setZalozka] = useState<'dotazy' | 'nahlaseni'>('dotazy');
  const [nahlaseni, setNahlaseni] = useState<Nahlaseni[]>([]);
  const [dotazy, setDotazy] = useState<Dotaz[]>([]);
  const [kategorieChybi, setKategorieChybi] = useState(false);
  const [nacitam, setNacitam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState<string | null>(null);
  const [odpovedi, setOdpovedi] = useState<Record<string, string>>({});

  const nacti = useCallback(async () => {
    setNacitam(true);
    setChyba(null);
    try {
      const data = await apiFetch<{
        reports: Nahlaseni[];
        questions: Dotaz[];
        kategorie_chybi?: boolean;
      }>(ENDPOINT);
      setNahlaseni(data.reports || []);
      setDotazy(data.questions || []);
      setKategorieChybi(data.kategorie_chybi === true);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Moderaci se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, []);

  useEffect(() => { nacti(); }, [nacti]);

  const proved = async (reportId: string, akce: Akce) => {
    setPracuje(reportId);
    setChyba(null);
    try {
      await apiFetch(ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ report_id: reportId, action: akce }),
      });
      await nacti();
      onZmena();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Akce se nepodařila.');
    } finally {
      setPracuje(null);
    }
  };

  const odpovez = async (dotazId: string) => {
    const text = (odpovedi[dotazId] || '').trim();
    if (!text) return;

    setPracuje(dotazId);
    setChyba(null);
    try {
      // Týmový štítek nastaví `reply.js` podle e-mailu ze session — klient
      // o `is_team` nerozhoduje.
      await apiFetch<{ reply: KomunitaOdpoved }>('/api/community/reply', {
        method: 'POST',
        body: JSON.stringify({ topic_id: dotazId, content: text }),
      });
      setOdpovedi((o) => ({ ...o, [dotazId]: '' }));
      await nacti();
      onZmena();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Odpověď se nepodařilo uložit.');
    } finally {
      setPracuje(null);
    }
  };

  const souhrn = `Moderace · ${sklonuj(dotazy.length, ['dotaz', 'dotazy', 'dotazů'])} · ${nahlaseni.length} nahlášení`;

  return (
    <div className={`rounded-2xl bg-povrch border ${rozbaleno ? 'border-cyan-500/30' : 'border-slate-800'}`}>
      <button
        type="button"
        onClick={() => setRozbaleno((r) => !r)}
        aria-expanded={rozbaleno}
        className="w-full min-h-11 px-3.5 flex items-center gap-2.5 text-left"
      >
        <Shield className="w-4 h-4 text-akcent-cyan shrink-0" />
        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-slate-200">{souhrn}</span>
        {nacitam && <Loader2 className="w-4 h-4 text-slate-500 animate-spin shrink-0" />}
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${rozbaleno ? 'rotate-180' : ''}`} />
      </button>

      {rozbaleno && (
        <div className="px-3.5 pb-4 space-y-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
            <Zalozka aktivni={zalozka === 'dotazy'} onClick={() => setZalozka('dotazy')}>
              Nezodpovězené dotazy ({dotazy.length})
            </Zalozka>
            <Zalozka aktivni={zalozka === 'nahlaseni'} onClick={() => setZalozka('nahlaseni')}>
              Nahlášení ({nahlaseni.length})
            </Zalozka>
          </div>

          {chyba && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{chyba}</span>
            </div>
          )}

          {zalozka === 'dotazy' ? (
            <div className="space-y-2.5">
              {kategorieChybi && (
                <p className="text-[11px] text-amber-300/90">
                  Kategorie „Dotazy" v databázi není — migrace 20260923010000 ještě neběžela.
                </p>
              )}
              {!nacitam && dotazy.length === 0 && !kategorieChybi && (
                <p className="text-sm text-slate-400">Všechno zodpovězené.</p>
              )}

              {dotazy.map((d) => (
                <div key={d.id} className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className="font-bold text-slate-200">{d.author_name || 'Člen'}</span>
                    <span className="text-slate-500">{new Date(d.created_at).toLocaleString('cs-CZ')}</span>
                    {d.reply_count > 0 && <span className="text-slate-400">{d.reply_count} od členů</span>}
                  </div>

                  <p className="text-sm text-slate-300 leading-relaxed break-words">{d.nahled || '—'}</p>

                  <div className="flex items-center gap-2">
                    <label htmlFor={`moderace-odpoved-${d.id}`} className="sr-only">Odpověď týmu</label>
                    <input
                      id={`moderace-odpoved-${d.id}`}
                      type="text"
                      value={odpovedi[d.id] || ''}
                      onChange={(e) => setOdpovedi((o) => ({ ...o, [d.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') odpovez(d.id);
                      }}
                      placeholder="Odpověz jako tým…"
                      className="flex-1 min-w-0 min-h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => odpovez(d.id)}
                      disabled={pracuje === d.id || !(odpovedi[d.id] || '').trim()}
                      className="shrink-0 min-h-11 px-3 rounded-xl text-xs font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 inline-flex items-center gap-1.5"
                    >
                      {pracuje === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>Odpovědět</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {!nacitam && nahlaseni.length === 0 && (
                <p className="text-sm text-slate-400">Nic nevyřízeného.</p>
              )}

              {nahlaseni.map((n) => (
                <div key={n.id} className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className="px-2 py-0.5 rounded-full font-bold text-slate-300 bg-slate-800 border border-slate-700">
                      {n.typ === 'prispevek' ? 'Příspěvek' : 'Odpověď'}
                    </span>
                    {n.author_name && <span className="text-slate-400">od {n.author_name}</span>}
                    {n.is_hidden && (
                      <span className="px-2 py-0.5 rounded-full font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40">
                        skrytý
                      </span>
                    )}
                    {!n.existuje && <span className="text-slate-500">obsah smazán</span>}
                  </div>

                  <p className="text-xs text-amber-300/90">Důvod: {n.reason || '—'}</p>

                  {n.nahled ? (
                    <p className="text-sm text-slate-300 leading-relaxed break-words">{n.nahled}</p>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Obsah už neexistuje — autor ho smazal sám.</p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {n.typ === 'prispevek' && n.existuje && (
                      n.is_hidden ? (
                        <TlacitkoAkce onClick={() => proved(n.id, 'unhide')} disabled={pracuje === n.id} barva="slate">
                          <Eye className="w-3.5 h-3.5" /> Zobrazit
                        </TlacitkoAkce>
                      ) : (
                        <TlacitkoAkce onClick={() => proved(n.id, 'hide')} disabled={pracuje === n.id} barva="amber">
                          <EyeOff className="w-3.5 h-3.5" /> Skrýt
                        </TlacitkoAkce>
                      )
                    )}

                    {n.existuje && (
                      <TlacitkoAkce onClick={() => proved(n.id, 'delete')} disabled={pracuje === n.id} barva="red">
                        <Trash2 className="w-3.5 h-3.5" /> Smazat
                      </TlacitkoAkce>
                    )}

                    <TlacitkoAkce onClick={() => proved(n.id, 'resolve')} disabled={pracuje === n.id} barva="slate">
                      <Check className="w-3.5 h-3.5" /> Vyřešit
                    </TlacitkoAkce>

                    {pracuje === n.id && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Zalozka: React.FC<{ aktivni: boolean; onClick: () => void; children: React.ReactNode }> = ({
  aktivni,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={aktivni}
    className={`flex-1 min-h-9 px-3 rounded-lg text-[11px] font-bold transition-all ${
      aktivni ? 'bg-cyan-950/80 text-akcent-cyan border border-cyan-500/40' : 'text-slate-400'
    }`}
  >
    {children}
  </button>
);

const TlacitkoAkce: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  barva: 'slate' | 'amber' | 'red';
  children: React.ReactNode;
}> = ({ onClick, disabled, barva, children }) => {
  const styl = {
    slate: 'text-slate-300 bg-slate-900 border-slate-700',
    amber: 'text-amber-300 bg-amber-950/50 border-amber-500/40',
    red: 'text-red-300 bg-red-950/50 border-red-500/40',
  }[barva];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-[11px] font-bold border disabled:opacity-50 ${styl}`}
    >
      {children}
    </button>
  );
};
