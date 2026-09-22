import React, { useCallback, useEffect, useState } from 'react';
import { Flag, Loader2, EyeOff, Eye, Trash2, Check, AlertTriangle } from 'lucide-react';

/**
 * ADMIN: FRONTA NAHLÁŠENÉHO OBSAHU.
 *
 * SKRÝT NENÍ SMAZAT. „Skrýt" nastaví `is_hidden = true` — příspěvek zmizí
 * všem kromě autora a dá se vrátit, když se nahlášení ukáže jako plané.
 * „Smazat" je nevratné a bere s sebou i fotky ze storage.
 *
 * Každá akce nahlášení uzavírá, i „Zobrazit" — znamená „podíval jsem se
 * a je to v pořádku". Fronta má obsahovat jen to, co ještě nikdo neviděl.
 *
 * Token si komponenta nedrží sama: dostává ho od admin stránky, která ho
 * už jednou vzala od uživatele. Dvě políčka na tentýž token by byla past.
 */
const ENDPOINT = '/api/admin/community-reports';

interface Nahlaseni {
  id: string;
  typ: 'prispevek' | 'odpoved';
  post_id: string | null;
  reply_id: string | null;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
  existuje: boolean;
  author_name: string | null;
  is_hidden: boolean | null;
  nahled: string | null;
}

type Akce = 'hide' | 'unhide' | 'delete' | 'resolve';

interface Props {
  token: string;
}

export const AdminNahlaseni: React.FC<Props> = ({ token }) => {
  const [seznam, setSeznam] = useState<Nahlaseni[]>([]);
  const [nacitam, setNacitam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState<string | null>(null);

  const nacti = useCallback(async () => {
    if (!token) return;
    setNacitam(true);
    setChyba(null);
    try {
      const odpoved = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (odpoved.status === 401 || odpoved.status === 403) {
        throw new Error('Token neplatí. Zkontroluj ADMIN_TOKEN.');
      }
      if (!odpoved.ok) throw new Error(`Server vrátil chybu ${odpoved.status}.`);
      const telo = await odpoved.json();
      setSeznam(telo.reports || []);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Nahlášení se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, [token]);

  useEffect(() => { nacti(); }, [nacti]);

  const proved = async (reportId: string, akce: Akce) => {
    setPracuje(reportId);
    setChyba(null);
    try {
      const odpoved = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ report_id: reportId, action: akce }),
      });
      const telo = await odpoved.json().catch(() => ({}));
      if (!odpoved.ok) throw new Error(telo?.error || `Server vrátil chybu ${odpoved.status}.`);
      // Vyřešené nahlášení z fronty zmizí — znovu načíst je levnější než
      // dopočítávat stav v prohlížeči.
      await nacti();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Akce se nepodařila.');
    } finally {
      setPracuje(null);
    }
  };

  return (
    <div className="p-5 rounded-3xl bg-povrch border border-slate-800 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-300">
            <Flag className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Nahlášený obsah</div>
            <div className="text-[11px] text-slate-400">Nevyřešená nahlášení z komunity</div>
          </div>
        </div>

        {nacitam ? (
          <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
        ) : (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-800">
            {seznam.length}
          </span>
        )}
      </div>

      {chyba && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{chyba}</span>
        </div>
      )}

      {!nacitam && seznam.length === 0 && (
        <p className="text-sm text-slate-400">Nic nevyřízeného. Fronta je prázdná.</p>
      )}

      <div className="space-y-3">
        {seznam.map((n) => (
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
              {!n.existuje && (
                <span className="px-2 py-0.5 rounded-full font-bold text-slate-400 bg-slate-800 border border-slate-700">
                  obsah smazán
                </span>
              )}
              <span className="text-slate-500">{new Date(n.created_at).toLocaleString('cs-CZ')}</span>
            </div>

            <p className="text-xs text-amber-300/90">Důvod: {n.reason || '—'}</p>

            {n.nahled ? (
              <p className="text-sm text-slate-300 leading-relaxed break-words">{n.nahled}</p>
            ) : (
              <p className="text-sm text-slate-500 italic">Obsah už neexistuje — autor ho smazal sám.</p>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-1">
              {n.typ === 'prispevek' && n.existuje && (
                n.is_hidden ? (
                  <Tlacitko onClick={() => proved(n.id, 'unhide')} disabled={pracuje === n.id} barva="slate">
                    <Eye className="w-3.5 h-3.5" /> Zobrazit
                  </Tlacitko>
                ) : (
                  <Tlacitko onClick={() => proved(n.id, 'hide')} disabled={pracuje === n.id} barva="amber">
                    <EyeOff className="w-3.5 h-3.5" /> Skrýt
                  </Tlacitko>
                )
              )}

              {n.existuje && (
                <Tlacitko onClick={() => proved(n.id, 'delete')} disabled={pracuje === n.id} barva="red">
                  <Trash2 className="w-3.5 h-3.5" /> Smazat
                </Tlacitko>
              )}

              <Tlacitko onClick={() => proved(n.id, 'resolve')} disabled={pracuje === n.id} barva="slate">
                <Check className="w-3.5 h-3.5" /> Vyřešit
              </Tlacitko>

              {pracuje === n.id && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Tlacitko: React.FC<{
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
