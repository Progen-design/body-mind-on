import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Users, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { NadpisSekce } from '../NadpisSekce';
import { CommunityPostDetail } from './CommunityPostDetail';
import { NewPostSheet } from './NewPostSheet';
import { PravidlaKomunity } from './PravidlaKomunity';
import { KartaPrispevku } from './KartaPrispevku';
import { KomunitaKategorie, KomunitaOdpoved, KomunitaPrispevek, SLUG_DOTAZY } from './typy';

/**
 * KOMUNITA — seznam příspěvků s filtrem podle kategorie.
 *
 * Kategorie jsou chipy, ne rozcestník do podfór: fórum je zatím prázdné
 * a dvě kliknutí navíc k jednomu příspěvku by ho nezaplnila. Výchozí je
 * „Vše", aby bylo hned vidět, že se tu něco děje.
 */
interface Props {
  /** Poslední vážení — předvyplní se do check-inu. */
  posledniVahaKg: number | null;
}

export const CommunityPage: React.FC<Props> = ({ posledniVahaKg }) => {
  const [kategorie, setKategorie] = useState<KomunitaKategorie[]>([]);
  const [aktivniKategorie, setAktivniKategorie] = useState<string | null>(null);
  const [prispevky, setPrispevky] = useState<KomunitaPrispevek[]>([]);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [novyOtevren, setNovyOtevren] = useState(false);
  const [pravidlaOtevrena, setPravidlaOtevrena] = useState(false);

  useEffect(() => {
    apiFetch<{ categories: KomunitaKategorie[] }>('/api/community/categories')
      .then((d) => setKategorie(d.categories || []))
      .catch(() => setKategorie([]));
  }, []);

  const nacti = useCallback(async () => {
    setNacitam(true);
    try {
      const cesta = aktivniKategorie
        ? `/api/community?category_id=${encodeURIComponent(aktivniKategorie)}`
        : '/api/community';
      const data = await apiFetch<{ topics: KomunitaPrispevek[] }>(cesta);
      setPrispevky(data.topics || []);
      setChyba(null);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Komunitu se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, [aktivniKategorie]);

  useEffect(() => { nacti(); }, [nacti]);

  const progres = useMemo(() => kategorie.find((k) => k.slug === 'muj-progres') ?? null, [kategorie]);
  const slugPodleId = useMemo(
    () => Object.fromEntries(kategorie.map((k) => [k.id, k.slug])),
    [kategorie],
  );
  const jsemVProgresu = progres != null && aktivniKategorie === progres.id;

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

  if (detailId) {
    return (
      <CommunityPostDetail
        prispevekId={detailId}
        onZpet={() => setDetailId(null)}
        onZmena={(zmeneny) => {
          if (!zmeneny) {
            setPrispevky((s) => s.filter((x) => x.id !== detailId));
            return;
          }
          setPrispevky((s) => s.map((x) => (x.id === zmeneny.id ? { ...x, ...zmeneny } : x)));
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <NadpisSekce
        titulek="Komunita"
        podtitulek="Co kdo zkusil a jak mu to jde — bez filtrů z reklam"
        ikona={<Users className="w-5 h-5 text-akcent-lime" />}
      />

      {/* Chipy kategorií */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        <Chip aktivni={aktivniKategorie === null} onClick={() => setAktivniKategorie(null)}>Vše</Chip>
        {kategorie.map((k) => (
          <Chip key={k.id} aktivni={aktivniKategorie === k.id} onClick={() => setAktivniKategorie(k.id)}>
            {k.name}
          </Chip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setNovyOtevren(true)}
          className="flex-1 min-h-11 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan inline-flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nový příspěvek</span>
        </button>

        <button
          type="button"
          onClick={() => setPravidlaOtevrena(true)}
          className="shrink-0 min-h-11 px-3 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 inline-flex items-center gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Pravidla komunity</span>
        </button>
      </div>

      {chyba && <p className="text-[11px] text-red-400">{chyba}</p>}

      {nacitam ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-akcent-lime animate-spin" />
        </div>
      ) : prispevky.length === 0 ? (
        <div className="p-6 rounded-3xl bg-povrch border border-slate-800 text-center">
          <p className="text-sm text-slate-300">
            {jsemVProgresu
              ? 'Přidej první check-in – fotka + váha. Za měsíc uvidíš rozdíl.'
              : 'Zatím tu nikdo nic nenapsal. Můžeš začít ty.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {prispevky.map((p) => (
            <KartaPrispevku
              key={p.id}
              prispevek={p}
              jeDotaz={slugPodleId[p.category_id ?? ''] === SLUG_DOTAZY}
              onOtevri={() => setDetailId(p.id)}
              onLajk={() => prepniLajk(p)}
              onPravidla={() => setPravidlaOtevrena(true)}
              onKomentar={(odpoved: KomunitaOdpoved) => setPrispevky((seznam) => seznam.map((x) => (
                x.id === p.id
                  ? {
                    ...x,
                    reply_count: x.reply_count + 1,
                    // Náhled drží poslední dvě — nová vytlačí nejstarší.
                    last_replies: [...(x.last_replies ?? []), odpoved].slice(-2),
                    team_answered: x.team_answered || odpoved.is_team === true,
                  }
                  : x
              )))}
            />
          ))}
        </div>
      )}

      {pravidlaOtevrena && <PravidlaKomunity onZavri={() => setPravidlaOtevrena(false)} />}

      {novyOtevren && (
        <NewPostSheet
          kategorie={kategorie}
          vychoziKategorieId={aktivniKategorie}
          posledniVahaKg={posledniVahaKg}
          onZavri={() => setNovyOtevren(false)}
          onUlozeno={(novy) => {
            setNovyOtevren(false);
            // Nový příspěvek se ukáže jen tam, kam patří — jinak by po
            // uložení v jiné kategorii zmizel a vypadalo to jako chyba.
            if (!aktivniKategorie || novy.category_id === aktivniKategorie) {
              setPrispevky((s) => [novy, ...s]);
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
