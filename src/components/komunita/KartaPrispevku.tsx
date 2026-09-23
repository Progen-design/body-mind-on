import React, { useRef } from 'react';
import { Heart, MessageCircle, Scale, Lock, Clock } from 'lucide-react';
import { kdyMereno } from '../../data/adaptery';
import { KomentareHandle, KomentareVKarte } from './KomentareVKarte';
import { KomunitaOdpoved, KomunitaPrispevek } from './typy';

/** Náhled textu v kartě. Celý příspěvek je v detailu. */
const NAHLED_TEXTU = 160;

/**
 * JEDEN PŘÍSPĚVEK V SEZNAMU.
 *
 * Vytažené z `CommunityPage` ve chvíli, kdy ke kartě přibyly komentáře —
 * jeden soubor by jinak držel seznam, filtr, kartu i vlákno komentářů.
 */
interface Props {
  prispevek: KomunitaPrispevek;
  /** Jen v Dotazech se ukazuje „Čeká na odpověď". */
  jeDotaz: boolean;
  onOtevri: () => void;
  onLajk: () => void;
  onPravidla: () => void;
  onKomentar: (odpoved: KomunitaOdpoved) => void;
}

export const KartaPrispevku: React.FC<Props> = ({
  prispevek,
  jeDotaz,
  onOtevri,
  onLajk,
  onPravidla,
  onKomentar,
}) => {
  const prvniFotka = prispevek.photos[0] ?? null;
  const nahled = prispevek.content.slice(0, NAHLED_TEXTU)
    + (prispevek.content.length > NAHLED_TEXTU ? '…' : '');
  const komentare = useRef<KomentareHandle>(null);

  return (
    <div className="rounded-3xl bg-povrch border border-slate-800 overflow-hidden">
      <button type="button" onClick={onOtevri} className="w-full text-left p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          {prispevek.author_avatar_url ? (
            <img src={prispevek.author_avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0" />
          ) : (
            <span className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
              {prispevek.author_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white truncate">{prispevek.author_name}</div>
            <div className="text-[11px] text-slate-500">{kdyMereno(prispevek.created_at)}</div>
          </div>

          {/* „Čeká na odpověď" JEN v Dotazech. Jinde by to slibovalo reakci
              týmu, kterou nikdo neslíbil. */}
          {jeDotaz && !prispevek.team_answered && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40 shrink-0">
              <Clock className="w-3 h-3" />
              Čeká na odpověď
            </span>
          )}
          {prispevek.is_hidden && <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-label="Jen pro mě" />}
        </div>

        {/* 4:5 a strop 420 px. Fotky z telefonu jsou na výšku a bez omezení
            by jedna karta zabrala celou obrazovku — seznam by se nedal
            projít. Celá fotka je až v detailu. */}
        {prvniFotka && (
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 aspect-[4/5] max-h-[420px]">
            <img src={prvniFotka.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            {prispevek.photos.length > 1 && (
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/70 text-slate-200">
                +{prispevek.photos.length - 1}
              </span>
            )}
          </div>
        )}

        {prispevek.weight_kg != null && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/70 border border-slate-800 text-xs font-bold text-white">
            <Scale className="w-3.5 h-3.5 text-akcent-cyan" />
            {prispevek.weight_kg.toString().replace('.', ',')} kg
          </span>
        )}

        {nahled && <p className="text-sm text-slate-300 leading-relaxed break-words">{nahled}</p>}
      </button>

      <div className="px-4 pb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onLajk}
          aria-pressed={prispevek.liked_by_me}
          aria-label={prispevek.liked_by_me ? 'Odebrat lajk' : 'Dát lajk'}
          className={`inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg text-xs font-bold ${
            prispevek.liked_by_me ? 'text-rose-300' : 'text-slate-400'
          }`}
        >
          <Heart className={`w-4 h-4 ${prispevek.liked_by_me ? 'fill-rose-400 text-rose-400' : ''}`} />
          <span>{prispevek.like_count}</span>
        </button>

        {/* Bublina fokusne pole, neotevře detail — kdo na ni klikne, chce
            psát, ne číst. */}
        <button
          type="button"
          onClick={() => komentare.current?.fokusuj()}
          aria-label="Napsat komentář"
          className="inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg text-xs font-bold text-slate-400"
        >
          <MessageCircle className="w-4 h-4" />
          <span>{prispevek.reply_count}</span>
        </button>
      </div>

      <KomentareVKarte
        ref={komentare}
        postId={prispevek.id}
        odpovedi={prispevek.last_replies ?? []}
        celkem={prispevek.reply_count}
        onOtevriDetail={onOtevri}
        onPridano={onKomentar}
        onPravidla={onPravidla}
      />
    </div>
  );
};
