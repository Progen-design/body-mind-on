import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, Trash2, Scale, Lock, Loader2, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { kdyMereno } from '../../data/adaptery';
import { KomunitaOdpoved, KomunitaPrispevek } from './typy';

/**
 * DETAIL PŘÍSPĚVKU — fotky, text, u check-inu váha, odpovědi.
 *
 * Fotky se otevírají přes celou obrazovku: u check-inu je rozdíl vidět
 * na detailu, ne na náhledu velikosti nehtu.
 */
interface Props {
  prispevekId: string;
  onZpet: () => void;
  /** Ať seznam nemusí znovu tahat celý feed kvůli jednomu lajku nebo smazání. */
  onZmena: (prispevek: KomunitaPrispevek | null) => void;
}

export const CommunityPostDetail: React.FC<Props> = ({ prispevekId, onZpet, onZmena }) => {
  const [prispevek, setPrispevek] = useState<KomunitaPrispevek | null>(null);
  const [odpovedi, setOdpovedi] = useState<KomunitaOdpoved[]>([]);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [odesila, setOdesila] = useState(false);
  const [fotkaNaCelou, setFotkaNaCelou] = useState<string | null>(null);

  const nacti = useCallback(async () => {
    setNacitam(true);
    try {
      const data = await apiFetch<{ topic: KomunitaPrispevek; replies: KomunitaOdpoved[] }>(
        `/api/community/topic/${prispevekId}`,
      );
      setPrispevek(data.topic);
      setOdpovedi(data.replies || []);
      setChyba(null);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Příspěvek se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, [prispevekId]);

  useEffect(() => { nacti(); }, [nacti]);

  const prepniLajk = async () => {
    if (!prispevek) return;
    try {
      const odpoved = await apiFetch<{ liked: boolean; like_count: number }>('/api/community/like', {
        method: 'POST',
        body: JSON.stringify({ post_id: prispevek.id }),
      });
      const novy = { ...prispevek, liked_by_me: odpoved.liked, like_count: odpoved.like_count };
      setPrispevek(novy);
      onZmena(novy);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Lajk se nepodařilo uložit.');
    }
  };

  const odesliOdpoved = async () => {
    if (!prispevek || text.trim().length === 0) return;
    setOdesila(true);
    try {
      const data = await apiFetch<{ reply: KomunitaOdpoved }>('/api/community/reply', {
        method: 'POST',
        body: JSON.stringify({ topic_id: prispevek.id, content: text.trim() }),
      });
      setOdpovedi((p) => [...p, data.reply]);
      setText('');
      const novy = { ...prispevek, reply_count: prispevek.reply_count + 1 };
      setPrispevek(novy);
      onZmena(novy);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Odpověď se nepodařilo uložit.');
    } finally {
      setOdesila(false);
    }
  };

  const smaz = async () => {
    if (!prispevek) return;
    try {
      await apiFetch(`/api/community/post/${prispevek.id}`, { method: 'DELETE' });
      onZmena(null);
      onZpet();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Příspěvek se nepodařilo smazat.');
    }
  };

  if (nacitam) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-akcent-lime animate-spin" />
      </div>
    );
  }

  if (!prispevek) {
    return (
      <div className="p-6 rounded-3xl bg-povrch border border-slate-800 text-center space-y-3">
        <p className="text-sm text-slate-300">{chyba || 'Příspěvek nenajdeme.'}</p>
        <button type="button" onClick={onZpet} className="min-h-11 px-4 rounded-xl border border-slate-700 text-sm text-slate-200">
          Zpět do komunity
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onZpet}
        className="inline-flex items-center gap-1.5 min-h-11 text-sm text-slate-300 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Zpět do komunity</span>
      </button>

      <article className="p-5 rounded-3xl bg-povrch border border-slate-800 space-y-4">
        <header className="flex items-center gap-3">
          <Avatar url={prispevek.author_avatar_url} jmeno={prispevek.author_name} />
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{prispevek.author_name}</div>
            <div className="text-[11px] text-slate-500">{kdyMereno(prispevek.created_at)}</div>
          </div>
          {prispevek.is_hidden && (
            <span className="ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40">
              <Lock className="w-3 h-3" />
              Jen pro mě
            </span>
          )}
        </header>

        {prispevek.photos.length > 0 && (
          <div className={`grid gap-2 ${prispevek.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {prispevek.photos.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFotkaNaCelou(f.url)}
                className="relative aspect-square rounded-2xl overflow-hidden border border-slate-800"
              >
                <img src={f.url} alt={`Fotka ${i + 1} v příspěvku`} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        {prispevek.weight_kg != null && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <Scale className="w-4 h-4 text-akcent-cyan" />
            <span className="text-sm font-bold text-white">
              {prispevek.weight_kg.toString().replace('.', ',')} kg
            </span>
          </div>
        )}

        {prispevek.content && (
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{prispevek.content}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={prepniLajk}
            aria-pressed={prispevek.liked_by_me}
            className={`inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl border text-xs font-bold ${
              prispevek.liked_by_me
                ? 'text-rose-300 bg-rose-950/40 border-rose-500/40'
                : 'text-slate-300 bg-slate-900 border-slate-800'
            }`}
          >
            <Heart className={`w-4 h-4 ${prispevek.liked_by_me ? 'fill-rose-400 text-rose-400' : ''}`} />
            <span>{prispevek.like_count}</span>
          </button>

          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <MessageCircle className="w-4 h-4" />
            {prispevek.reply_count}
          </span>

          {prispevek.can_delete && (
            <button
              type="button"
              onClick={smaz}
              className="ml-auto inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold text-red-300 bg-red-950/40 border border-red-500/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Smazat</span>
            </button>
          )}
        </div>
      </article>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-white">Odpovědi</h3>

        {odpovedi.length === 0 && (
          <p className="text-sm text-slate-400">Zatím bez odpovědí. Můžeš být první.</p>
        )}

        {odpovedi.map((o) => (
          <div key={o.id} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2">
              <Avatar url={o.author_avatar_url} jmeno={o.author_name} maly />
              <span className="text-xs font-bold text-slate-200">{o.author_name}</span>
              <span className="text-[11px] text-slate-500">{kdyMereno(o.created_at)}</span>
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{o.content}</p>
          </div>
        ))}

        <div className="space-y-2">
          <label htmlFor="komunita-odpoved" className="sr-only">Tvoje odpověď</label>
          <textarea
            id="komunita-odpoved"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Napiš odpověď"
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={odesliOdpoved}
            disabled={odesila || text.trim().length === 0}
            className="min-h-11 px-4 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 inline-flex items-center gap-2"
          >
            {odesila && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{odesila ? 'Odesílám…' : 'Odpovědět'}</span>
          </button>
        </div>

        {chyba && <p className="text-[11px] text-red-400">{chyba}</p>}
      </section>

      {fotkaNaCelou && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setFotkaNaCelou(null)}
            aria-label="Zavřít fotku"
            className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
          <img src={fotkaNaCelou} alt="Fotka v příspěvku" className="max-w-full max-h-full object-contain rounded-2xl" />
        </div>
      )}
    </div>
  );
};

const Avatar: React.FC<{ url: string | null; jmeno: string; maly?: boolean }> = ({ url, jmeno, maly }) => {
  const rozmer = maly ? 'w-6 h-6 text-[10px]' : 'w-10 h-10 text-xs';
  if (url) {
    return <img src={url} alt="" className={`${rozmer} rounded-full object-cover border border-slate-700 shrink-0`} />;
  }
  return (
    <span className={`${rozmer} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 shrink-0`}>
      {jmeno.slice(0, 1).toUpperCase()}
    </span>
  );
};
