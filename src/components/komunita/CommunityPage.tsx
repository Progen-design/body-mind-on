import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Users, ShieldCheck, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { NadpisSekce } from '../NadpisSekce';
import { CommunityPostDetail } from './CommunityPostDetail';
import { NewPostSheet } from './NewPostSheet';
import { PravidlaKomunity } from './PravidlaKomunity';
import { KartaPrispevku } from './KartaPrispevku';
import { PanelModerace } from './PanelModerace';
import { pripojStranku, VELIKOST_STRANKY } from './feedLogika';
import { KomunitaKategorie, KomunitaPrispevek, SLUG_DOTAZY } from './typy';

/**
 * KOMUNITA — feed příspěvků ve stylu Instagramu.
 *
 * Kategorie jsou chipy přilepené nahoře, ne rozcestník do podfór: dvě
 * kliknutí navíc k jednomu příspěvku by fórum nezaplnila. Výchozí je „Vše",
 * aby bylo hned vidět, že se tu něco děje.
 *
 * Feed se tahá po 20 a dotahuje se, když se člověk doscrolluje ke konci.
 * Detail vlákna feed jen schová, neodmontuje — po návratu je člověk tam,
 * kde přestal, a nic se nestahuje znovu.
 */
interface Props {
  /** Poslední vážení — předvyplní se do check-inu. */
  posledniVahaKg: number | null;
}

interface OtevrenyDetail {
  id: string;
  /** Přišlo se z „Napiš komentář…" — kurzor rovnou do lišty. */
  fokus: boolean;
}

export const CommunityPage: React.FC<Props> = ({ posledniVahaKg }) => {
  const [kategorie, setKategorie] = useState<KomunitaKategorie[]>([]);
  const [aktivniKategorie, setAktivniKategorie] = useState<string | null>(null);
  const [prispevky, setPrispevky] = useState<KomunitaPrispevek[]>([]);
  const [maDalsi, setMaDalsi] = useState(false);
  const [nacitam, setNacitam] = useState(true);
  const [nacitamDalsi, setNacitamDalsi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [detail, setDetail] = useState<OtevrenyDetail | null>(null);
  const [novy, setNovy] = useState<{ typ?: 'text' | 'checkin' } | null>(null);
  const [pravidlaOtevrena, setPravidlaOtevrena] = useState(false);
  // Příznak ze serveru (`ADMIN_EMAILS`). Je jen pro UI — oprávnění si
  // endpointy moderace ověřují samy, schovaný panel nic nechrání.
  const [jeAdmin, setJeAdmin] = useState(false);

  // Kolik příspěvků už server vydal pro aktuální filtr. Nový příspěvek ho
  // posune o jedna nahoru, smazaný o jedna dolů — jinak by další stránka
  // jeden příspěvek zopakovala nebo přeskočila.
  const offset = useRef(0);
  // Přepnutí kategorie uprostřed načítání: odpověď pro starý filtr se zahodí.
  const pozadavek = useRef(0);
  const beziDalsi = useRef(false);
  const hlidka = useRef<HTMLDivElement>(null);
  const scrollPredDetailem = useRef(0);

  useEffect(() => {
    apiFetch<{ categories: KomunitaKategorie[] }>('/api/community/categories')
      .then((d) => setKategorie(d.categories || []))
      .catch(() => setKategorie([]));
  }, []);

  const nactiStranku = useCallback(async (reset: boolean) => {
    const id = ++pozadavek.current;
    const od = reset ? 0 : offset.current;
    if (reset) setNacitam(true);
    else setNacitamDalsi(true);

    try {
      const dotaz = new URLSearchParams({ limit: String(VELIKOST_STRANKY), offset: String(od) });
      if (aktivniKategorie) dotaz.set('category_id', aktivniKategorie);
      const data = await apiFetch<{ topics: KomunitaPrispevek[]; has_more?: boolean; is_admin?: boolean }>(
        `/api/community?${dotaz.toString()}`,
      );
      if (id !== pozadavek.current) return;

      const nove = data.topics || [];
      offset.current = od + nove.length;
      setPrispevky((s) => (reset ? nove : pripojStranku(s, nove)));
      setMaDalsi(data.has_more ?? nove.length === VELIKOST_STRANKY);
      setJeAdmin(data.is_admin === true);
      setChyba(null);
    } catch (err) {
      if (id !== pozadavek.current) return;
      setChyba(err instanceof Error ? err.message : 'Komunitu se nepodařilo načíst.');
      // Po chybě dál nedotahujeme — jinak by hlídka na konci feedu
      // bombardovala server, dokud síť nenaskočí.
      if (!reset) setMaDalsi(false);
    } finally {
      if (id === pozadavek.current) {
        setNacitam(false);
        setNacitamDalsi(false);
      }
    }
  }, [aktivniKategorie]);

  const obnov = useCallback(() => { nactiStranku(true); }, [nactiStranku]);
  useEffect(() => { obnov(); }, [obnov]);

  const nactiDalsi = useCallback(() => {
    if (beziDalsi.current) return;
    beziDalsi.current = true;
    nactiStranku(false).finally(() => { beziDalsi.current = false; });
  }, [nactiStranku]);

  // Hlídka na konci feedu. Observer se zakládá znovu po každé stránce: když
  // je hlídka pořád vidět (krátká stránka, vysoký displej), hned dotáhne další.
  useEffect(() => {
    const el = hlidka.current;
    if (!el || !maDalsi || nacitam || detail) return;
    const pozorovatel = new IntersectionObserver(
      (zaznamy) => { if (zaznamy.some((z) => z.isIntersecting)) nactiDalsi(); },
      { rootMargin: '0px 0px 800px 0px' },
    );
    pozorovatel.observe(el);
    return () => pozorovatel.disconnect();
  }, [maDalsi, nacitam, detail, nactiDalsi, prispevky.length]);

  // Návrat z detailu na místo ve feedu, kde člověk skončil.
  const bylDetail = useRef(false);
  useLayoutEffect(() => {
    if (!detail && bylDetail.current) window.scrollTo({ top: scrollPredDetailem.current });
    bylDetail.current = detail !== null;
  }, [detail]);

  const progres = useMemo(() => kategorie.find((k) => k.slug === 'muj-progres') ?? null, [kategorie]);
  const slugPodleId = useMemo(
    () => Object.fromEntries(kategorie.map((k) => [k.id, k.slug])),
    [kategorie],
  );
  const nazvyKategorii = useMemo(
    () => Object.fromEntries(kategorie.map((k) => [k.id, k.name])),
    [kategorie],
  );
  // Prázdné „Vše" nebo „Můj progres" zve na check-in. V Dotazech nebo
  // Tréninku by výzva k fotce a váze zněla mimo.
  const vyzvaKCheckinu = aktivniKategorie === null || aktivniKategorie === progres?.id;

  const otevriDetail = (id: string, fokus: boolean) => {
    scrollPredDetailem.current = window.scrollY;
    setDetail({ id, fokus });
  };

  const prepniLajk = async (p: KomunitaPrispevek) => {
    try {
      const odpoved = await apiFetch<{ liked: boolean; like_count: number }>('/api/community/like', {
        method: 'POST',
        body: JSON.stringify({ post_id: p.id }),
      });
      setPrispevky((seznam) => seznam.map((x) => (
        x.id === p.id ? { ...x, liked_by_me: odpoved.liked, like_count: odpoved.like_count } : x
      )));
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Lajk se nepodařilo uložit.');
    }
  };

  return (
    <div className="w-full sm:max-w-xl sm:mx-auto">
      <div className={detail ? 'hidden' : 'space-y-3'}>
        <NadpisSekce
          titulek="Komunita"
          podtitulek="Co kdo zkusil a jak mu to jde — bez filtrů z reklam"
          ikona={<Users className="w-5 h-5 text-akcent-lime" />}
        />

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPravidlaOtevrena(true)}
            className="shrink-0 min-h-11 px-3 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 inline-flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Pravidla komunity</span>
          </button>

          {/* Na mobilu je „+" plovoucí vpravo dole, na desktopu tady. */}
          <button
            type="button"
            onClick={() => setNovy({})}
            className="hidden sm:inline-flex min-h-11 px-4 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nový příspěvek</span>
          </button>
        </div>

        {jeAdmin && <PanelModerace onZmena={obnov} />}

        {/* Chipy kategorií — přilepené nahoře, ať jde filtr přepnout i uprostřed feedu. */}
        <div className="sticky top-0 z-20 -mx-3.5 px-3.5 sm:mx-0 sm:px-0 py-2 bg-pozadi/95 backdrop-blur">
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip aktivni={aktivniKategorie === null} onClick={() => setAktivniKategorie(null)}>Vše</Chip>
            {kategorie.map((k) => (
              <Chip key={k.id} aktivni={aktivniKategorie === k.id} onClick={() => setAktivniKategorie(k.id)}>
                {k.name}
              </Chip>
            ))}
          </div>
        </div>

        {chyba && <p className="text-[11px] text-red-400">{chyba}</p>}

        {nacitam ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-akcent-lime animate-spin" />
          </div>
        ) : prispevky.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-4">
            <p className="text-sm text-slate-300">
              {vyzvaKCheckinu
                ? 'Zatím ticho. Přidej první check-in – fotka, váha a pár slov.'
                : 'Zatím ticho. Napiš první příspěvek.'}
            </p>
            <button
              type="button"
              onClick={() => setNovy(vyzvaKCheckinu ? { typ: 'checkin' } : {})}
              className="min-h-11 px-5 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{vyzvaKCheckinu ? 'Přidat check-in' : 'Nový příspěvek'}</span>
            </button>
          </div>
        ) : (
          <div className="-mx-3.5 sm:mx-0 border-t border-slate-800/80">
            {prispevky.map((p) => (
              <KartaPrispevku
                key={p.id}
                prispevek={p}
                jeDotaz={slugPodleId[p.category_id ?? ''] === SLUG_DOTAZY}
                nazevKategorie={aktivniKategorie ? null : nazvyKategorii[p.category_id ?? ''] ?? null}
                onOtevri={(fokus) => otevriDetail(p.id, fokus)}
                onLajk={() => prepniLajk(p)}
              />
            ))}

            <div ref={hlidka} aria-hidden="true" />
            {nacitamDalsi && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
              </div>
            )}
            {!maDalsi && prispevky.length > VELIKOST_STRANKY && (
              <p className="py-6 text-center text-xs text-slate-600">Víc tu toho zatím není.</p>
            )}
          </div>
        )}

        {/* Místo pod FAB, ať nepřekryje poslední „Napiš komentář…". */}
        <div className="h-20 sm:hidden" aria-hidden="true" />
      </div>

      {detail && (
        <CommunityPostDetail
          key={detail.id}
          prispevekId={detail.id}
          fokusListy={detail.fokus}
          nazvyKategorii={nazvyKategorii}
          onZpet={() => setDetail(null)}
          onZmena={(zmeneny) => {
            if (!zmeneny) {
              offset.current = Math.max(0, offset.current - 1);
              setPrispevky((s) => s.filter((x) => x.id !== detail.id));
              return;
            }
            setPrispevky((s) => s.map((x) => (x.id === zmeneny.id ? { ...x, ...zmeneny } : x)));
          }}
        />
      )}

      {!detail && !novy && (
        <button
          type="button"
          onClick={() => setNovy({})}
          aria-label="Nový příspěvek"
          className="sm:hidden fixed z-30 right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] w-14 h-14 rounded-full bg-akcent-cyan text-slate-950 shadow-[0_8px_24px_rgba(0,242,254,0.35)] flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {pravidlaOtevrena && <PravidlaKomunity onZavri={() => setPravidlaOtevrena(false)} />}

      {novy && (
        <NewPostSheet
          kategorie={kategorie}
          vychoziKategorieId={aktivniKategorie}
          vychoziTyp={novy.typ}
          posledniVahaKg={posledniVahaKg}
          onZavri={() => setNovy(null)}
          onUlozeno={(ulozeny) => {
            setNovy(null);
            // Nový příspěvek se ukáže jen tam, kam patří — jinak by po
            // uložení v jiné kategorii zmizel a vypadalo to jako chyba.
            if (!aktivniKategorie || ulozeny.category_id === aktivniKategorie) {
              offset.current += 1;
              setPrispevky((s) => [ulozeny, ...s]);
            }
          }}
        />
      )}
    </div>
  );
};

const Chip: React.FC<{ aktivni: boolean; onClick: () => void; children: React.ReactNode }> = ({
  aktivni,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={aktivni}
    className={`shrink-0 min-h-9 px-3.5 rounded-full text-xs font-semibold border transition-all ${
      aktivni
        ? 'bg-cyan-950/70 text-akcent-cyan border-cyan-500/50'
        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);
