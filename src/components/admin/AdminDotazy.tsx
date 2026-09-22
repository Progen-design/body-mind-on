import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircleQuestion, Loader2, Send, AlertTriangle, Check } from 'lucide-react';
import { apiFetch } from '../../lib/api';

/**
 * ADMIN: NEZODPOVĚZENÉ DOTAZY.
 *
 * Fronta sekce „Dotazy" — co se zeptal člen a tým zatím nechal bez odpovědi.
 * Odpovídá se rovnou odsud, protože cesta „zjistit, že něco visí → najít to
 * v appce → napsat" se neujde a dotaz zůstane ležet.
 *
 * ODPOVĚĎ SE PODEPISUJE ÚČTEM, NE TOKENEM. `community_replies.user_id` je
 * NOT NULL s cizím klíčem na `auth.users`, takže musí existovat skutečný
 * autor. Request proto nese OBOJE: uživatelskou session v `Authorization`
 * (doplní `apiFetch`) a ADMIN_TOKEN v `x-admin-token`, podle kterého server
 * nastaví `is_team`. Kdo tu není přihlášený jako uživatel, dostane 401
 * a hlášku, co s tím.
 */
const ENDPOINT = '/api/admin/community-questions';

interface Dotaz {
  id: string;
  author_name: string | null;
  created_at: string;
  reply_count: number;
  nahled: string | null;
}

interface Props {
  token: string;
}

export const AdminDotazy: React.FC<Props> = ({ token }) => {
  const [dotazy, setDotazy] = useState<Dotaz[]>([]);
  const [nacitam, setNacitam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [kategorieChybi, setKategorieChybi] = useState(false);
  const [odpovedi, setOdpovedi] = useState<Record<string, string>>({});
  const [odesila, setOdesila] = useState<string | null>(null);
  const [hotove, setHotove] = useState<string[]>([]);

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
      setDotazy(telo.questions || []);
      setKategorieChybi(telo.kategorie_chybi === true);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Dotazy se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, [token]);

  useEffect(() => { nacti(); }, [nacti]);

  const odpovez = async (dotazId: string) => {
    const text = (odpovedi[dotazId] || '').trim();
    if (!text) return;

    setOdesila(dotazId);
    setChyba(null);
    try {
      await apiFetch('/api/community/reply', {
        method: 'POST',
        headers: { 'x-admin-token': token },
        body: JSON.stringify({ topic_id: dotazId, content: text }),
      });
      setHotove((h) => [...h, dotazId]);
      setOdpovedi((o) => ({ ...o, [dotazId]: '' }));
      // Zodpovězený dotaz z fronty zmizí — načíst znovu je levnější než
      // dopočítávat stav v prohlížeči.
      await nacti();
    } catch (err) {
      const zprava = err instanceof Error ? err.message : 'Odpověď se nepodařilo uložit.';
      setChyba(
        /session|přihlas/i.test(zprava)
          ? 'Odpověď se podepisuje tvým účtem — přihlas se v appce ve stejném prohlížeči.'
          : zprava,
      );
    } finally {
      setOdesila(null);
    }
  };

  return (
    <div className="p-5 rounded-3xl bg-povrch border border-slate-800 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-akcent-cyan">
            <MessageCircleQuestion className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Nezodpovězené dotazy</div>
            <div className="text-[11px] text-slate-400">Sekce Dotazy — odpověď se označí „Tým BMON"</div>
          </div>
        </div>

        {nacitam ? (
          <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
        ) : (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-800">
            {dotazy.length}
          </span>
        )}
      </div>

      {kategorieChybi && (
        <p className="text-[11px] text-amber-300/90">
          Kategorie „Dotazy" v databázi není — migrace 20260923010000 ještě neběžela.
        </p>
      )}

      {chyba && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{chyba}</span>
        </div>
      )}

      {!nacitam && dotazy.length === 0 && !kategorieChybi && (
        <p className="text-sm text-slate-400">Všechno zodpovězené. Fronta je prázdná.</p>
      )}

      <div className="space-y-3">
        {dotazy.map((d) => (
          <div key={d.id} className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="font-bold text-slate-200">{d.author_name || 'Člen'}</span>
              <span className="text-slate-500">{new Date(d.created_at).toLocaleString('cs-CZ')}</span>
              {d.reply_count > 0 && (
                <span className="text-slate-400">{d.reply_count} od členů</span>
              )}
              {hotove.includes(d.id) && (
                <span className="inline-flex items-center gap-1 text-akcent-lime">
                  <Check className="w-3 h-3" /> odesláno
                </span>
              )}
            </div>

            <p className="text-sm text-slate-300 leading-relaxed break-words">{d.nahled || '—'}</p>

            <div className="flex items-center gap-2">
              <label htmlFor={`odpoved-${d.id}`} className="sr-only">Odpověď týmu</label>
              <input
                id={`odpoved-${d.id}`}
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
                disabled={odesila === d.id || !(odpovedi[d.id] || '').trim()}
                className="shrink-0 min-h-11 px-3 rounded-xl text-xs font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 inline-flex items-center gap-1.5"
              >
                {odesila === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Odpovědět</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
