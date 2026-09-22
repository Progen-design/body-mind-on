import React, { useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Send, Loader2, ShieldCheck, BadgeCheck } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { kdyMereno } from '../../data/adaptery';
import { KomunitaOdpoved } from './typy';

/**
 * KOMENTÁŘE PŘÍMO V KARTĚ.
 *
 * Poslední dvě odpovědi a jednořádkové pole. Dřív se muselo do detailu
 * a zpátky kvůli jedné větě — což nikdo neudělá, takže se pod příspěvky
 * nepsalo.
 *
 * ŽÁDNÝ DALŠÍ REQUEST NA KARTU. `GET /api/community` posílá `last_replies`
 * s sebou; kdyby si každá karta došla pro komentáře sama, znamenal by
 * jeden scroll feedu dvacet dotazů navíc.
 */
export interface KomentareHandle {
  fokusuj: () => void;
}

interface Props {
  postId: string;
  odpovedi: KomunitaOdpoved[];
  celkem: number;
  onOtevriDetail: () => void;
  /** Nová odpověď — rodič si podle ní zvýší `reply_count` a doplní náhled. */
  onPridano: (odpoved: KomunitaOdpoved) => void;
  /** Otevře pravidla, když je uživatel ještě nepotvrdil. */
  onPravidla: () => void;
}

export const KomentareVKarte = forwardRef<KomentareHandle, Props>(({
  postId,
  odpovedi,
  celkem,
  onOtevriDetail,
  onPridano,
  onPravidla,
}, ref) => {
  const [text, setText] = useState('');
  const [odesila, setOdesila] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [potrebujeSouhlas, setPotrebujeSouhlas] = useState(false);
  const [souhlasZaskrtnut, setSouhlasZaskrtnut] = useState(false);
  const pole = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    fokusuj: () => pole.current?.focus(),
  }));

  const odesli = async () => {
    const obsah = text.trim();
    if (!obsah) return;

    setOdesila(true);
    setChyba(null);
    try {
      const data = await apiFetch<{ reply: KomunitaOdpoved }>('/api/community/reply', {
        method: 'POST',
        body: JSON.stringify({
          topic_id: postId,
          content: obsah,
          souhlas_s_pravidly: souhlasZaskrtnut || undefined,
        }),
      });
      setText('');
      setPotrebujeSouhlas(false);
      onPridano(data.reply);
    } catch (err) {
      // 403 s `needs_consent` není chyba — je to pokyn ukázat zaškrtávátko.
      const potreba = (err as { needs_consent?: boolean })?.needs_consent === true;
      if (potreba) {
        setPotrebujeSouhlas(true);
        setChyba('Nejdřív potvrď pravidla komunity.');
      } else {
        setChyba(err instanceof Error ? err.message : 'Komentář se nepodařilo uložit.');
      }
    } finally {
      setOdesila(false);
    }
  };

  const nelzeOdeslat = odesila
    || text.trim().length === 0
    || (potrebujeSouhlas && !souhlasZaskrtnut);

  return (
    <div className="px-4 pb-4 space-y-2.5 border-t border-slate-800/80 pt-3">
      {odpovedi.map((o) => (
        <div key={o.id} className="flex items-start gap-2">
          {o.author_avatar_url ? (
            <img src={o.author_avatar_url} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-700 shrink-0" />
          ) : (
            <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
              {o.author_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-200">{o.author_name}</span>
              {o.is_team && <StitekTym />}
              <span className="text-[10px] text-slate-500">{kdyMereno(o.created_at)}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed break-words">{o.content}</p>
          </div>
        </div>
      ))}

      {celkem > odpovedi.length && (
        <button
          type="button"
          onClick={onOtevriDetail}
          className="text-[11px] font-semibold text-akcent-cyan"
        >
          Zobrazit všech {celkem}
        </button>
      )}

      {potrebujeSouhlas && (
        <div className="p-2.5 rounded-xl bg-slate-900/70 border border-cyan-500/30 space-y-1.5">
          <label className="flex items-start gap-2 text-[11px] text-slate-200 cursor-pointer">
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
            onClick={onPravidla}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-akcent-cyan"
          >
            <ShieldCheck className="w-3 h-3" />
            <span>Přečíst pravidla</span>
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor={`komentar-${postId}`} className="sr-only">Napiš komentář</label>
        <input
          id={`komentar-${postId}`}
          ref={pole}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !nelzeOdeslat) odesli();
          }}
          placeholder="Napiš komentář…"
          className="flex-1 min-w-0 min-h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600"
        />
        <button
          type="button"
          onClick={odesli}
          disabled={nelzeOdeslat}
          className="shrink-0 min-h-11 px-3 rounded-xl text-xs font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 inline-flex items-center gap-1.5"
        >
          {odesila ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span>Odeslat</span>
        </button>
      </div>

      {chyba && <p className="text-[10px] text-red-400">{chyba}</p>}
    </div>
  );
});

KomentareVKarte.displayName = 'KomentareVKarte';

/** Štítek týmové odpovědi. Rada od nás musí být k rozeznání od rady kohokoli jiného. */
export const StitekTym: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-akcent-cyan bg-cyan-950/70 border border-cyan-500/40">
    <BadgeCheck className="w-2.5 h-2.5" />
    Tým BMON
  </span>
);
