import React, { useLayoutEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Scale, Lock, Clock } from 'lucide-react';
import { Avatar } from './Avatar';
import { FotkyKarusel } from './FotkyKarusel';
import { KomentareVKarte } from './KomentareVKarte';
import { casRelativne } from './feedLogika';
import { KomunitaPrispevek } from './typy';

/**
 * JEDEN PŘÍSPĚVEK VE FEEDU — pořadí jako na Instagramu.
 *
 * Hlavička → fotka přes celou šířku → akce → text → poslední komentáře.
 * Bez rámečku a zaoblení: příspěvky dělí jen tenká linka, ať fotka dostane
 * celou šířku telefonu a feed se čte jako jeden proud, ne jako hromádka karet.
 */
interface Props {
  prispevek: KomunitaPrispevek;
  /** Jen v Dotazech se ukazuje „Čeká na odpověď". */
  jeDotaz: boolean;
  nazevKategorie: string | null;
  /** Otevře vlákno. `fokus` = kurzor rovnou do chatovací lišty. */
  onOtevri: (fokus: boolean) => void;
  onLajk: () => void;
}

export const KartaPrispevku: React.FC<Props> = ({
  prispevek,
  jeDotaz,
  nazevKategorie,
  onOtevri,
  onLajk,
}) => {
  const [celyText, setCelyText] = useState(false);
  const [textPretika, setTextPretika] = useState(false);
  const text = useRef<HTMLParagraphElement>(null);

  // „více" jen tam, kde tři řádky opravdu nestačí — podle vykreslení,
  // ne podle počtu znaků, který na úzkém a širokém displeji znamená jiné.
  useLayoutEffect(() => {
    const el = text.current;
    if (el && !celyText) setTextPretika(el.scrollHeight > el.clientHeight + 1);
  }, [prispevek.content, celyText]);

  return (
    <article className="border-b border-slate-800/80 pb-3">
      <header className="flex items-center gap-2.5 px-4 py-2.5">
        <button type="button" onClick={() => onOtevri(false)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
          <Avatar url={prispevek.author_avatar_url} jmeno={prispevek.author_name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-bold text-white truncate">{prispevek.author_name}</span>
              {nazevKategorie && (
                <span className="shrink-0 px-1.5 py-px rounded-md text-[10px] font-semibold text-slate-400 bg-slate-900 border border-slate-800">
                  {nazevKategorie}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500">{casRelativne(prispevek.created_at)}</div>
          </div>
        </button>

        {/* „Čeká na odpověď" JEN v Dotazech. Jinde by to slibovalo reakci
            týmu, kterou nikdo neslíbil. */}
        {jeDotaz && !prispevek.team_answered && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40 shrink-0">
            <Clock className="w-3 h-3" />
            Čeká na odpověď
          </span>
        )}
        {prispevek.is_hidden && <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-label="Jen pro mě" />}
      </header>

      <FotkyKarusel fotky={prispevek.photos} onKlik={() => onOtevri(false)} />

      <div className="flex items-center gap-1 px-2.5 pt-1.5">
        <button
          type="button"
          onClick={onLajk}
          aria-pressed={prispevek.liked_by_me}
          aria-label={prispevek.liked_by_me ? 'Odebrat lajk' : 'Dát lajk'}
          className={`inline-flex items-center gap-1.5 min-h-11 px-1.5 text-sm font-bold ${
            prispevek.liked_by_me ? 'text-rose-300' : 'text-slate-300'
          }`}
        >
          <Heart className={`w-6 h-6 ${prispevek.liked_by_me ? 'fill-rose-400 text-rose-400' : ''}`} />
          <span>{prispevek.like_count}</span>
        </button>

        <button
          type="button"
          onClick={() => onOtevri(true)}
          aria-label="Komentáře"
          className="inline-flex items-center gap-1.5 min-h-11 px-1.5 text-sm font-bold text-slate-300"
        >
          <MessageCircle className="w-6 h-6" />
          <span>{prispevek.reply_count}</span>
        </button>

        {prispevek.post_type === 'checkin' && prispevek.weight_kg != null && (
          <span className="ml-auto mr-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/70 border border-slate-800 text-xs font-bold text-white">
            <Scale className="w-3.5 h-3.5 text-akcent-cyan" />
            {prispevek.weight_kg.toString().replace('.', ',')} kg
          </span>
        )}
      </div>

      {prispevek.content && (
        <div className="px-4 pb-1.5">
          <p
            ref={text}
            onClick={() => onOtevri(false)}
            className={`text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words cursor-pointer ${
              celyText ? '' : 'line-clamp-3'
            }`}
          >
            {prispevek.content}
          </p>
          {textPretika && !celyText && (
            <button
              type="button"
              onClick={() => setCelyText(true)}
              className="min-h-8 text-sm font-semibold text-slate-500 hover:text-slate-300"
            >
              více
            </button>
          )}
        </div>
      )}

      <KomentareVKarte
        odpovedi={prispevek.last_replies ?? []}
        celkem={prispevek.reply_count}
        onOtevriDetail={onOtevri}
      />
    </article>
  );
};
