import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, Trash2, Scale, Lock, Loader2, X, Flag, Send, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { NahlasitSheet } from './NahlasitSheet';
import { PravidlaKomunity } from './PravidlaKomunity';
import { StitekTym } from './KomentareVKarte';
import { Avatar } from './Avatar';
import { FotkyKarusel } from './FotkyKarusel';
import { casRelativne, OBNOVA_VLAKNA_MS, seskupBubliny, SkupinaBublin } from './feedLogika';
import { KomunitaOdpoved, KomunitaPrispevek } from './typy';

/**
 * VLÁKNO — příspěvek jako hlavička, odpovědi jako chat.
 *
 * Vlastní bubliny vpravo, cizí vlevo, tým BMON vlevo se zeleným okrajem.
 * Lišta na psaní je přilepená dole, ať se odpovídá jako v chatu, ne
 * formulářem pod dlouhým vláknem.
 *
 * Dokud je vlákno otevřené, každých 30 s se tiše obnoví — jen když je
 * záložka vidět, ať telefon v kapse nestahuje data pro nikoho.
 */
interface Props {
  prispevekId: string;
  /** Kurzor rovnou do lišty — přišlo se z „Napiš komentář…". */
  fokusListy: boolean;
  nazvyKategorii: Record<string, string>;
  onZpet: () => void;
  /** Ať feed nemusí znovu tahat všechno kvůli jednomu lajku nebo smazání. */
  onZmena: (prispevek: KomunitaPrispevek | null) => void;
}

/** Nejvýš čtyři řádky, pak se lišta scrolluje uvnitř. */
const MAX_VYSKA_POLE_PX = 4 * 20 + 16;

export const CommunityPostDetail: React.FC<Props> = ({
  prispevekId,
  fokusListy,
  nazvyKategorii,
  onZpet,
  onZmena,
}) => {
  const { scope: mojeId } = useAuth();
  const [prispevek, setPrispevek] = useState<KomunitaPrispevek | null>(null);
  const [odpovedi, setOdpovedi] = useState<KomunitaOdpoved[]>([]);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [odesila, setOdesila] = useState(false);
  const [potrebujeSouhlas, setPotrebujeSouhlas] = useState(false);
  const [pravidlaOtevrena, setPravidlaOtevrena] = useState(false);
  const [fotkaNaCelou, setFotkaNaCelou] = useState<string | null>(null);
  // Klepnutí na bublinu ukáže čas a „Nahlásit" — jako v Messengeru.
  const [vybranaId, setVybranaId] = useState<string | null>(null);
  // Dvoukrok místo window.confirm: nativní dialog vypadá cize, jde odklikat
  // poslepu a na mobilu se schová pod adresní řádek.
  const [mazaniPotvrzeni, setMazaniPotvrzeni] = useState(false);
  const [nahlasit, setNahlasit] = useState<{ postId?: string; replyId?: string } | null>(null);
  const { showToast } = useToast();

  const pole = useRef<HTMLTextAreaElement>(null);
  const konec = useRef<HTMLDivElement>(null);
  // Tichá obnova spuštěná PŘED odesláním by po návratu přepsala seznam bez
  // právě odeslané bubliny. Každé odeslání zvedne verzi a starší výsledek
  // obnovy se zahodí.
  const verze = useRef(0);
  const onZmenaRef = useRef(onZmena);
  useEffect(() => { onZmenaRef.current = onZmena; }, [onZmena]);
  const pocetOdpovedi = useRef(0);
  useEffect(() => { pocetOdpovedi.current = odpovedi.length; }, [odpovedi]);

  const dolu = useCallback((plynule = true) => {
    requestAnimationFrame(() => konec.current?.scrollIntoView({ block: 'end', behavior: plynule ? 'smooth' : 'auto' }));
  }, []);

  const nacti = useCallback(async (tise: boolean) => {
    const start = verze.current;
    if (!tise) setNacitam(true);
    try {
      const data = await apiFetch<{ topic: KomunitaPrispevek; replies: KomunitaOdpoved[] }>(
        `/api/community/topic/${prispevekId}`,
      );
      if (verze.current !== start) return;

      const nove = data.replies || [];
      // Přibylo něco a člověk je u konce vlákna? Posuň, ať to vidí.
      if (tise && nove.length > pocetOdpovedi.current) {
        const uKonce = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
        if (uKonce) dolu();
      }
      setOdpovedi(nove);
      setPrispevek(data.topic);
      // Feed si z tiché obnovy vezme i čerstvý náhled posledních dvou.
      if (tise) onZmenaRef.current({ ...data.topic, last_replies: nove.slice(-2) });
      setChyba(null);
    } catch (err) {
      // Tichá obnova nehlásí nic — výpadek sítě na 30 s není zpráva pro
      // uživatele, další pokus přijde sám.
      if (!tise) setChyba(err instanceof Error ? err.message : 'Příspěvek se nepodařilo načíst.');
    } finally {
      if (!tise) setNacitam(false);
    }
  }, [prispevekId, dolu]);

  useEffect(() => { nacti(false); }, [nacti]);

  // Po prvním načtení: z „Napiš komentář…" rovnou dolů do lišty, jinak nahoru
  // na příspěvek.
  const uvodniPosun = useRef(false);
  useLayoutEffect(() => {
    if (nacitam || !prispevek || uvodniPosun.current) return;
    uvodniPosun.current = true;
    if (fokusListy) {
      konec.current?.scrollIntoView({ block: 'end' });
      pole.current?.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [nacitam, prispevek, fokusListy]);

  useEffect(() => {
    const tik = () => {
      if (document.visibilityState === 'visible') nacti(true);
    };
    const id = window.setInterval(tik, OBNOVA_VLAKNA_MS);
    // Návrat do záložky = hned čerstvé vlákno, ne až za půl minuty.
    document.addEventListener('visibilitychange', tik);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tik);
    };
  }, [nacti]);

  const skupiny = useMemo(() => seskupBubliny(odpovedi, mojeId), [odpovedi, mojeId]);

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

  const prizpusobVysku = () => {
    const el = pole.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_VYSKA_POLE_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_VYSKA_POLE_PX ? 'auto' : 'hidden';
  };

  const odesli = async (souhlas = false) => {
    const obsah = text.trim();
    if (!prispevek || !obsah || odesila) return;

    setOdesila(true);
    setChyba(null);
    verze.current += 1;
    try {
      const data = await apiFetch<{ reply: KomunitaOdpoved }>('/api/community/reply', {
        method: 'POST',
        body: JSON.stringify({
          topic_id: prispevek.id,
          content: obsah,
          souhlas_s_pravidly: souhlas || undefined,
        }),
      });
      setOdpovedi((p) => [...p, data.reply]);
      setText('');
      setPotrebujeSouhlas(false);
      requestAnimationFrame(prizpusobVysku);
      const novy = {
        ...prispevek,
        reply_count: prispevek.reply_count + 1,
        team_answered: prispevek.team_answered || data.reply.is_team === true,
        // Feed drží náhled posledních dvou — nová vytlačí nejstarší.
        last_replies: [...odpovedi, data.reply].slice(-2),
      };
      setPrispevek(novy);
      onZmena(novy);
      dolu();
    } catch (err) {
      // 403 s `needs_consent` není chyba — je to pokyn ukázat lištu se
      // souhlasem. Rozhodnutí patří serveru, klient si ho nedomýšlí.
      const potreba = (err as { needs_consent?: boolean })?.needs_consent === true
        || (err instanceof Error && /pravidla komunity/i.test(err.message));
      if (potreba) setPotrebujeSouhlas(true);
      else setChyba(err instanceof Error ? err.message : 'Odpověď se nepodařilo uložit.');
    } finally {
      setOdesila(false);
    }
  };

  const smaz = async () => {
    setMazaniPotvrzeni(false);
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

  const nazevKategorie = prispevek.category_id ? nazvyKategorii[prispevek.category_id] ?? null : null;
  const nelzeOdeslat = odesila || text.trim().length === 0;

  return (
    <div className="-mx-3.5 sm:mx-0 flex flex-col min-h-[calc(100dvh-6rem)]">
      <button
        type="button"
        onClick={onZpet}
        className="self-start inline-flex items-center gap-1.5 min-h-11 px-4 sm:px-0 text-sm text-slate-300 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Zpět do komunity</span>
      </button>

      {/* Hlavička vlákna = původní příspěvek */}
      <article className="border-b border-slate-800/80 pb-3">
        <header className="flex items-center gap-2.5 px-4 py-2.5">
          <Avatar url={prispevek.author_avatar_url} jmeno={prispevek.author_name} />
          <div className="min-w-0 flex-1">
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
          {prispevek.is_hidden && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40">
              <Lock className="w-3 h-3" />
              Jen pro mě
            </span>
          )}
        </header>

        <FotkyKarusel fotky={prispevek.photos} onKlik={(f) => setFotkaNaCelou(f.url)} />

        <div className="flex items-center gap-1 px-2.5 pt-1.5">
          <button
            type="button"
            onClick={prepniLajk}
            aria-pressed={prispevek.liked_by_me}
            aria-label={prispevek.liked_by_me ? 'Odebrat lajk' : 'Dát lajk'}
            className={`inline-flex items-center gap-1.5 min-h-11 px-1.5 text-sm font-bold ${
              prispevek.liked_by_me ? 'text-rose-300' : 'text-slate-300'
            }`}
          >
            <Heart className={`w-6 h-6 ${prispevek.liked_by_me ? 'fill-rose-400 text-rose-400' : ''}`} />
            <span>{prispevek.like_count}</span>
          </button>

          <span className="inline-flex items-center gap-1.5 min-h-11 px-1.5 text-sm font-bold text-slate-300">
            <MessageCircle className="w-6 h-6" />
            {prispevek.reply_count}
          </span>

          {prispevek.post_type === 'checkin' && prispevek.weight_kg != null && (
            <span className="inline-flex items-center gap-1.5 ml-1 px-2.5 py-1 rounded-lg bg-slate-900/70 border border-slate-800 text-xs font-bold text-white">
              <Scale className="w-3.5 h-3.5 text-akcent-cyan" />
              {prispevek.weight_kg.toString().replace('.', ',')} kg
            </span>
          )}

          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => setNahlasit({ postId: prispevek.id })}
              aria-label="Nahlásit příspěvek"
              className="inline-flex items-center justify-center min-h-11 min-w-11 text-slate-500 hover:text-amber-300"
            >
              <Flag className="w-4 h-4" />
            </button>
            {prispevek.can_delete && !mazaniPotvrzeni && (
              <button
                type="button"
                onClick={() => setMazaniPotvrzeni(true)}
                aria-label="Smazat příspěvek"
                className="inline-flex items-center justify-center min-h-11 min-w-11 text-slate-500 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {mazaniPotvrzeni && (
          <div className="mx-4 mt-1 p-3 rounded-2xl bg-red-950/30 border border-red-500/30 space-y-2">
            <p className="text-[12px] text-amber-300/90">Smaže se i fotky. Nejde vrátit.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={smaz}
                className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold text-white bg-red-600 border border-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Opravdu smazat</span>
              </button>
              <button
                type="button"
                onClick={() => setMazaniPotvrzeni(false)}
                className="min-h-11 px-3 rounded-xl text-xs font-bold text-slate-300 bg-slate-900 border border-slate-700"
              >
                Zpět
              </button>
            </div>
          </div>
        )}

        {prispevek.content && (
          <p className="px-4 pt-1 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
            {prispevek.content}
          </p>
        )}
      </article>

      {/* Vlákno */}
      <section aria-label="Odpovědi" className="flex-1 px-3 py-4 space-y-3">
        {odpovedi.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-6">Zatím bez odpovědí. Můžeš být první.</p>
        )}

        {skupiny.map((s) => (
          <SkupinaVlakna
            key={s.klic}
            skupina={s}
            vybranaId={vybranaId}
            onVyber={(id) => setVybranaId((v) => (v === id ? null : id))}
            onNahlasit={(id) => setNahlasit({ replyId: id })}
          />
        ))}
        <div ref={konec} />
      </section>

      {/* Chatovací lišta */}
      <div className="sticky bottom-0 z-20 bg-pozadi/95 backdrop-blur border-t border-slate-800 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {potrebujeSouhlas && (
          <div className="mb-2 flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-900/90 border border-cyan-500/30">
            <ShieldCheck className="w-4 h-4 text-akcent-cyan shrink-0" />
            <p className="flex-1 text-[12px] leading-snug text-slate-200">
              Před prvním komentářem potvrď{' '}
              <button type="button" onClick={() => setPravidlaOtevrena(true)} className="font-semibold text-akcent-cyan underline underline-offset-2">
                pravidla komunity
              </button>
              .
            </p>
            <button
              type="button"
              onClick={() => odesli(true)}
              disabled={nelzeOdeslat}
              className="shrink-0 min-h-9 px-3 rounded-xl text-xs font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500"
            >
              Souhlasím
            </button>
          </div>
        )}

        {chyba && <p className="mb-1.5 px-1 text-[11px] text-red-400">{chyba}</p>}

        <div className="flex items-end gap-2">
          <label htmlFor="komunita-odpoved" className="sr-only">Tvoje odpověď</label>
          <textarea
            id="komunita-odpoved"
            ref={pole}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              prizpusobVysku();
            }}
            onKeyDown={(e) => {
              // Enter odešle, Shift+Enter zalomí. Při skládání znaků (IME)
              // Enter jen potvrzuje znak — nesmí odeslat napůl napsané slovo.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!potrebujeSouhlas) odesli();
              }
            }}
            placeholder="Napiš odpověď…"
            className="flex-1 min-w-0 min-h-11 px-4 py-3 rounded-3xl resize-none overflow-hidden bg-slate-900 border border-slate-800 text-sm leading-5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
          <button
            type="button"
            onClick={() => odesli()}
            disabled={nelzeOdeslat || potrebujeSouhlas}
            aria-label="Odeslat"
            className="shrink-0 w-11 h-11 rounded-full bg-akcent-cyan text-slate-950 flex items-center justify-center disabled:bg-slate-800 disabled:text-slate-500"
          >
            {odesila ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {pravidlaOtevrena && <PravidlaKomunity onZavri={() => setPravidlaOtevrena(false)} />}

      {nahlasit && (
        <NahlasitSheet
          postId={nahlasit.postId ?? null}
          replyId={nahlasit.replyId ?? null}
          onZavri={() => setNahlasit(null)}
          onHotovo={() => {
            setNahlasit(null);
            showToast({ title: 'Díky, podíváme se na to.', variant: 'success' });
          }}
        />
      )}

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

/** Barva bubliny podle strany. Tým má zelený okraj, ať je rada od nás vidět. */
const STYL_BUBLINY = {
  moje: 'bg-akcent-cyan text-slate-950',
  cizi: 'bg-slate-800 text-slate-100',
  tym: 'bg-slate-800 text-slate-100 border border-akcent-lime/60',
} as const;

const SkupinaVlakna: React.FC<{
  skupina: SkupinaBublin<KomunitaOdpoved>;
  vybranaId: string | null;
  onVyber: (id: string) => void;
  onNahlasit: (id: string) => void;
}> = ({ skupina, vybranaId, onVyber, onNahlasit }) => {
  const moje = skupina.strana === 'moje';
  const prvni = skupina.zpravy[0];
  const posledniId = skupina.zpravy[skupina.zpravy.length - 1].id;

  const bubliny = (
    <div className={`flex flex-col gap-0.5 min-w-0 max-w-[80%] ${moje ? 'items-end' : 'items-start'}`}>
      {!moje && (
        <div className="px-1 text-[11px] font-bold text-slate-400">
          {prvni.author_name}
          {skupina.strana === 'tym' && <StitekTym />}
        </div>
      )}
      {skupina.zpravy.map((z) => {
        const vybrana = vybranaId === z.id;
        return (
          <React.Fragment key={z.id}>
            <button
              type="button"
              onClick={() => onVyber(z.id)}
              className={`text-left px-3.5 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap break-words max-w-full ${STYL_BUBLINY[skupina.strana]}`}
            >
              {z.content}
            </button>
            {(vybrana || z.id === posledniId) && (
              <div className="flex items-center gap-2 px-1 text-[10px] text-slate-500">
                <span>{casRelativne(z.created_at)}</span>
                {vybrana && !moje && (
                  <button
                    type="button"
                    onClick={() => onNahlasit(z.id)}
                    aria-label={`Nahlásit odpověď od ${z.author_name}`}
                    className="inline-flex items-center gap-1 min-h-6 hover:text-amber-300"
                  >
                    <Flag className="w-3 h-3" />
                    Nahlásit
                  </button>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  if (moje) return <div className="flex justify-end">{bubliny}</div>;

  return (
    <div className="flex items-start gap-2">
      <Avatar url={prvni.author_avatar_url} jmeno={prvni.author_name} velikost="mala" />
      {bubliny}
    </div>
  );
};
