/**
 * VIZUÁLNÍ VRSTVA TĚLESNÉHO VÝVOJE (návrh z temp-design, srpen 2026).
 *
 * Komponenty jsou ČISTĚ PREZENTAČNÍ — nemají vlastní stav ani fetch. Všechna
 * data i akce dostávají z `WithingsBodyDevelopmentSection`, který drží
 * napojení na `/api/withings/latest`, `/history` a `/sync`. Návrh přišel
 * s napevno zadrátovanými hodnotami (104,6 kg / 11,6 % / 88,9 kg); ty jsou
 * nahrazené propsy, takže karta ukazuje skutečná měření z váhy.
 *
 * STYLOVÁNO TAILWINDEM. V téhle aplikaci je Tailwind zapojený jen jako
 * utility vrstva bez Preflightu (viz styles/globals.css), takže tyhle třídy
 * fungují a zbytek profilu psaný ve styled-jsx zůstává nedotčený.
 *
 * Chybějící hodnota se kreslí jako „—“, nikdy jako nula. Prázdná váha není
 * naměřená nula a tvářit se tak by bylo tvrzení bez podkladu.
 */
import {
  Activity,
  Dumbbell,
  Flame,
  Gauge,
  Link2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wifi,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  MIN_BODU_GRAFU,
  ROZSAHY_GRAFU,
  celkovaZmena,
  dostupneRozsahy,
  filtrujRozsah,
  formatMetrikaCs,
  pocatecniRozsah,
  smerTrendu,
} from '../../../lib/profile/telesneMetriky.js';
import {
  IKONA_DOBRE,
  IKONA_NEUTRALNI,
  IKONA_SPATNE,
  KARTA,
  KARTA_NEON,
  KARTA_NEON_JEMNA,
  PREPINAC_AKTIVNI,
  TLACITKO,
} from '../../../lib/profile/designTokens.js';

const cislo = formatMetrikaCs;

/**
 * Trendová pilulka. Kladná změna není automaticky „dobrá“ — u tuku je lepší
 * pokles, u svalů růst, takže směr hodnocení určuje volající přes `dobreKdyz`.
 */
function Trend({ hodnota, jednotka, popis, dobreKdyz = 'klesa' }) {
  const smer = smerTrendu(hodnota, dobreKdyz);
  if (!smer) return null;
  const n = Number(hodnota);
  const roste = n > 0;
  const dobre = smer === 'dobre';
  const barva = dobre ? 'text-[#39ff14]' : smer === 'neutralni' ? 'text-neutral-300' : 'text-amber-400';
  const ramecek = dobre ? IKONA_DOBRE : smer === 'neutralni' ? IKONA_NEUTRALNI : IKONA_SPATNE;
  const Ikona = roste ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${ramecek}`}>
        <Ikona className={`w-4 h-4 ${barva}`} />
      </div>
      <div>
        <div className={`text-sm font-bold ${barva}`}>
          {roste ? '+' : ''}{cislo(n)}{jednotka}
        </div>
        <div className="text-xs text-neutral-400">{popis}</div>
      </div>
    </div>
  );
}

/** Uvítací karta se jménem z profilu. */
export function UserGreetingCard({ jmeno, program, poslednePřed }) {
  return (
    <div className={`${KARTA} p-5 sm:p-6 flex items-center justify-between gap-4`}>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#00f2fe]/80">
          Tělesný vývoj
        </div>
        <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white tracking-tight truncate">
          {jmeno || 'Tvůj profil'}
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-neutral-400">
          {poslednePřed ? `Poslední měření ${poslednePřed}` : 'Zatím bez měření z váhy'}
        </p>
      </div>
      {program ? (
        <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#0e1a24] text-[#00f2fe] border border-[#00f2fe]/30">
          {program}
        </span>
      ) : null}
    </div>
  );
}

/** Váha, tuk, svalová hmota, BMI — čtyři skutečné hodnoty z poslední synchronizace. */
export function StatCards({ vaha, vahaZmena, tuk, tukZmena, svaly, bmi }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4 w-full">
      <div className={`${KARTA_NEON} md:col-span-5 flex flex-col justify-between p-5 sm:p-6`}>
        <div>
          <div className="flex items-center justify-between text-neutral-400 text-sm font-medium">
            <span>Váha</span>
            <Activity className="w-4 h-4 text-[#00f2fe]/60" />
          </div>
          <div className="mt-2 text-3xl font-extrabold leading-none tracking-tight text-white sm:text-4xl lg:text-[42px]">
            {cislo(vaha) ?? '—'}
            {cislo(vaha) ? <span className="text-2xl font-semibold text-neutral-200">&nbsp;kg</span> : null}
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-neutral-800/60">
          <Trend hodnota={vahaZmena} jednotka=" kg" popis="Za 7 dní" />
        </div>
      </div>

      <div className="md:col-span-7 flex flex-col gap-3.5 sm:gap-4">
        <div className={`${KARTA_NEON_JEMNA} flex items-center justify-between gap-3 p-5`}>
          <div>
            <div className="flex items-center gap-1.5 text-neutral-400 text-sm font-medium">
              <span>Tuk</span>
              <Flame className="w-3.5 h-3.5 text-amber-400/70" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1.5">
              {cislo(tuk) ?? '—'}
              {cislo(tuk) ? <span className="text-xl font-medium text-neutral-300">&nbsp;%</span> : null}
            </div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-[#111622] border border-neutral-800">
            <Trend hodnota={tukZmena} jednotka=" %" popis="Za 7 dní" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
          <div className={`${KARTA_NEON_JEMNA} p-4 sm:p-5`}>
            <div className="flex items-center justify-between text-neutral-400 text-xs sm:text-sm font-medium">
              <span>Svalová hmota</span>
              <Dumbbell className="w-3.5 h-3.5 text-neutral-500" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-2">
              {cislo(svaly) ?? '—'}
              {cislo(svaly) ? <span className="text-base font-normal text-neutral-400">&nbsp;kg</span> : null}
            </div>
          </div>
          <div className={`${KARTA_NEON_JEMNA} p-4 sm:p-5`}>
            <div className="flex items-center justify-between text-neutral-400 text-xs sm:text-sm font-medium">
              <span>BMI</span>
              <Gauge className="w-3.5 h-3.5 text-neutral-500" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-2">
              {cislo(bmi) ?? '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Graf vývoje váhy ze skutečné historie měření.
 *
 * Kreslí se ručním SVG, ne knihovnou — návrh to tak měl a přidávat kvůli
 * jedné křivce další závislost nedává smysl. Pod třemi body se graf nekreslí:
 * dvě tečky nejsou trend a spojnice mezi nimi by tvrdila víc, než data unesou.
 *
 * ČASOVÉ ROZSAHY FILTRUJÍ DOOPRAVDY. Návrh v3 měl přepínač 1M/3M/6M/1R jen
 * jako ozdobu — `selectedRange` se v něm nikde nepoužil a graf pořád kreslil
 * všechna data. Tady se podle rozsahu data opravdu ořezávají a rozsah, ve
 * kterém nejsou aspoň tři měření, se ZAKÁŽE. Prázdný graf vypadá jako chyba
 * aplikace; zašedlé tlačítko je informace, že v tom okně zatím nic není.
 */
export function WeightChartCard({ zaznamy = [] }) {
  const vsechny = (zaznamy || [])
    .map((r) => ({ datum: r.datum, cas: r.cas, vaha: Number(r.vaha) }))
    .filter((r) => Number.isFinite(r.vaha));

  const dostupne = useMemo(() => dostupneRozsahy(vsechny), [vsechny]);
  const vychozi = useMemo(() => pocatecniRozsah(vsechny), [vsechny]);
  const [rozsah, setRozsah] = useState(vychozi);
  const aktivni = rozsah && dostupne[rozsah] ? rozsah : vychozi;

  const body = aktivni ? filtrujRozsah(vsechny, aktivni) : [];

  const prepinac = (
    <div className="flex items-center gap-1.5 self-start rounded-xl border border-neutral-800 bg-[#0f121a] p-1 sm:self-auto">
      {ROZSAHY_GRAFU.map((r) => {
        const lze = dostupne[r.id];
        const jeAktivni = r.id === aktivni;
        return (
          <button
            key={r.id}
            type="button"
            disabled={!lze}
            onClick={() => setRozsah(r.id)}
            title={lze ? r.popis : `${r.popis} — zatím není dost měření`}
            aria-pressed={jeAktivni}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
              jeAktivni
                ? PREPINAC_AKTIVNI
                : lze
                  ? 'cursor-pointer text-neutral-400 hover:text-white'
                  : 'cursor-not-allowed text-neutral-700'
            }`}
          >
            {r.id}
          </button>
        );
      })}
    </div>
  );

  if (body.length < MIN_BODU_GRAFU) {
    return (
      <div className={`${KARTA} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold tracking-tight text-white">Vývoj váhy</h3>
          {prepinac}
        </div>
        <p className="mt-3 text-sm text-neutral-400">
          Na graf je potřeba aspoň {MIN_BODU_GRAFU} měření. Zatím jich máš {vsechny.length}.
        </p>
      </div>
    );
  }

  const W = 700;
  const H = 220;
  const P = { top: 16, right: 16, bottom: 28, left: 40 };
  const sirka = W - P.left - P.right;
  const vyska = H - P.top - P.bottom;
  const hodnoty = body.map((b) => b.vaha);
  const min = Math.min(...hodnoty);
  const max = Math.max(...hodnoty);
  const rozpeti = max - min || 1;
  const x = (i) => P.left + (i / (body.length - 1)) * sirka;
  const y = (v) => P.top + vyska - ((v - min) / rozpeti) * vyska;

  const cara = body.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)},${y(b.vaha).toFixed(1)}`).join(' ');
  const plocha = `${cara} L ${x(body.length - 1).toFixed(1)},${P.top + vyska} L ${x(0).toFixed(1)},${P.top + vyska} Z`;
  const zmena = celkovaZmena(body) ?? 0;
  const klesa = zmena <= 0;

  return (
    <div className={`${KARTA} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">Vývoj váhy</h3>
          <span
            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
              klesa
                ? 'border-[#39ff14]/30 bg-[#132326] text-[#39ff14]'
                : 'border-amber-400/30 bg-[#2a2113] text-amber-300'
            }`}
          >
            {zmena > 0 ? '+' : ''}{formatMetrikaCs(zmena)} kg celkem
          </span>
        </div>
        {prepinac}
      </div>

      <p className="mt-1 text-xs text-neutral-500">
        {body.length} měření · {ROZSAHY_GRAFU.find((r) => r.id === aktivni)?.popis}
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label={`Graf vývoje váhy, ${body.length} měření`}>
        <defs>
          {/* Přechod podél křivky z azurové do limetkové — detail z návrhu v3. */}
          <linearGradient id="bmon-vaha-cara" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00f2fe" />
            <stop offset="60%" stopColor="#00f2fe" />
            <stop offset="100%" stopColor="#39ff14" />
          </linearGradient>
          <linearGradient id="bmon-vaha-plocha" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00f2fe" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((p) => (
          <line
            key={p}
            x1={P.left}
            x2={W - P.right}
            y1={P.top + vyska * p}
            y2={P.top + vyska * p}
            stroke="rgba(148,163,184,0.15)"
            strokeWidth="1"
          />
        ))}
        <path d={plocha} fill="url(#bmon-vaha-plocha)" />
        <path
          d={cara}
          fill="none"
          stroke="url(#bmon-vaha-cara)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 6px rgba(0,242,254,0.35))' }}
        />
        {body.map((b, i) => (
          <circle key={`${b.cas ?? b.datum}-${i}`} cx={x(i)} cy={y(b.vaha)} r="3.5" fill="#0a0b0e" stroke="#00f2fe" strokeWidth="2">
            <title>{`${b.datum} · ${formatMetrikaCs(b.vaha)} kg`}</title>
          </circle>
        ))}
        <text x={P.left - 8} y={P.top + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{formatMetrikaCs(max)}</text>
        <text x={P.left - 8} y={P.top + vyska} textAnchor="end" fontSize="11" fill="#94a3b8">{formatMetrikaCs(min)}</text>
        <text x={P.left} y={H - 8} fontSize="11" fill="#94a3b8">{body[0].datum}</text>
        <text x={W - P.right} y={H - 8} textAnchor="end" fontSize="11" fill="#94a3b8">{body[body.length - 1].datum}</text>
      </svg>
    </div>
  );
}

/** Stav propojení s Withings a tlačítka pro synchronizaci / připojení. */
export function WithingsSyncCard({
  pripojeno,
  synchronizuje,
  poslednePřed,
  hlaska,
  onSync,
  onConnect,
  connectLabel,
  connectDisabled,
}) {
  return (
    <div className={`${KARTA} p-5 sm:p-6`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-md">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-white tracking-tight">Withings</h3>
            {pripojeno ? (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                <Wifi className="w-3 h-3" /> Připojeno
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-900 text-neutral-400 border border-neutral-700">
                Nepřipojeno
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
            Chytrá váha posílá tělesnou kompozici do profilu sama. Další týdenní plán
            se upravuje podle trendu, ne podle jednoho vážení.
          </p>
          {poslednePřed ? (
            <div className="text-[11px] text-neutral-500 flex items-center gap-1.5 pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f2fe]" />
              <span>Poslední přenos: {poslednePřed}</span>
            </div>
          ) : null}
          {hlaska ? <p className="text-xs text-amber-300 pt-1">{hlaska}</p> : null}
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0 w-full sm:w-auto md:w-60">
          {pripojeno ? (
            <button
              type="button"
              onClick={onSync}
              disabled={synchronizuje}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#00f2fe]/15 border border-[#00f2fe]/45 text-[#baf6ff] font-bold text-sm hover:bg-[#00f2fe]/25 disabled:opacity-60 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${synchronizuje ? 'animate-spin' : ''}`} />
              {synchronizuje ? 'Synchronizuji…' : 'Synchronizovat teď'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConnect}
            disabled={connectDisabled}
            className={`${TLACITKO} min-h-[44px] px-4`}
          >
            <Link2 className="w-4 h-4" />
            {connectLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
