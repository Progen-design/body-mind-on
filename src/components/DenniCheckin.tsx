import React from 'react';
import { MessageCircle, Check, ChevronRight, Mail } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ActiveTab } from './NavigationTabs';

// JAK TI DNEŠEK SEDĚL — jedna otázka, která vede k akci.
//
// `GET/POST /api/daily-checkin` existoval od začátku i s číselníkem důvodů,
// ale UI ho nikdy nezavolalo: tabulka `daily_checkins` měla v produkci
// 9. 9. 2026 nula řádků. Sbírat odpovědi ale samo o sobě nestačí — proto
// každý důvod končí konkrétní nabídkou, ne poděkováním.
//
// PROČ NE HVĚZDIČKY. Škála 1–5 řekne „bylo to tak 3", což se nedá použít.
// Čtyři pojmenované odpovědi a sedm důvodů z `lib/productEventAllowlist.js`
// míří na věci, se kterými aplikace umí něco udělat.
//
// KDO SE NEPTÁ DVAKRÁT. Server drží jeden check-in na kalendářní den
// (Europe/Prague) a při načtení vrátí ten dnešní — když už odpověď je,
// karta se přepne do potvrzení a znovu se neptá.

type Hodnoceni = 'great' | 'good' | 'partial' | 'none';
type Duvod =
  | 'no_time'
  | 'food_mismatch'
  | 'workout_too_hard'
  | 'workout_too_easy'
  | 'no_motivation'
  | 'technical_problem'
  | 'other';

const HODNOCENI: Array<{ id: Hodnoceni; label: string }> = [
  { id: 'great', label: 'Skvěle' },
  { id: 'good', label: 'Dobře' },
  { id: 'partial', label: 'Částečně' },
  { id: 'none', label: 'Vůbec' },
];

const DUVODY: Array<{ id: Duvod; label: string }> = [
  { id: 'no_time', label: 'Neměl jsem čas' },
  { id: 'food_mismatch', label: 'Jídlo mi nesedlo' },
  { id: 'workout_too_hard', label: 'Trénink byl moc těžký' },
  { id: 'workout_too_easy', label: 'Trénink byl moc lehký' },
  { id: 'no_motivation', label: 'Nebyla nálada' },
  { id: 'technical_problem', label: 'Něco v aplikaci nefungovalo' },
  { id: 'other', label: 'Něco jiného' },
];

/**
 * Co s tím důvodem uděláme. `zalozka` = kam odkázat, `text` = co se nabízí.
 * Důvody bez akce (nálada, jiné) dostanou jen větu — nabízet tlačítko,
 * které s příčinou nic neudělá, je horší než nenabízet nic.
 */
const POMOC: Record<Duvod, { text: string; tlacitko?: string; zalozka?: ActiveTab }> = {
  no_time: {
    text: 'Trénink jde zkrátit na 15 minut, aniž bys vypadl z plánu.',
    tlacitko: 'Zkrátit dnešní trénink',
    zalozka: 'trenink',
  },
  food_mismatch: {
    text: 'Jídlo v plánu jde vyměnit za jiné se stejnými makry.',
    tlacitko: 'Otevřít jídelníček',
    zalozka: 'jidelnicek',
  },
  workout_too_hard: {
    text: 'U většiny cviků je připravená lehčí varianta — najdeš ji v „Jak na to".',
    tlacitko: 'Otevřít trénink',
    zalozka: 'trenink',
  },
  workout_too_easy: {
    text: 'U většiny cviků je připravená těžší varianta — najdeš ji v „Jak na to".',
    tlacitko: 'Otevřít trénink',
    zalozka: 'trenink',
  },
  no_motivation: {
    text: 'Den, kdy to nejde, k tomu patří. Zítra se pokračuje tam, kde jsi skončil.',
  },
  technical_problem: {
    text: 'Napiš nám, co se stalo — opravíme to.',
  },
  other: {
    text: 'Díky. Zapsali jsme si to.',
  },
};

const KONTAKT = 'info@bodyandmindon.cz';

interface Props {
  onSelectTab: (tab: ActiveTab) => void;
}

interface OdpovedServeru {
  checkin?: { rating?: string; blocker?: string | null } | null;
}

export const DenniCheckin: React.FC<Props> = ({ onSelectTab }) => {
  const [hodnoceni, setHodnoceni] = React.useState<Hodnoceni | null>(null);
  const [duvod, setDuvod] = React.useState<Duvod | null>(null);
  const [hotovo, setHotovo] = React.useState(false);
  const [nacitam, setNacitam] = React.useState(true);
  const [chyba, setChyba] = React.useState<string | null>(null);

  React.useEffect(() => {
    let zive = true;
    apiFetch<OdpovedServeru>('/api/daily-checkin')
      .then((data) => {
        if (!zive) return;
        const ulozene = data?.checkin;
        if (ulozene?.rating) {
          setHodnoceni(ulozene.rating as Hodnoceni);
          setDuvod((ulozene.blocker as Duvod) || null);
          setHotovo(true);
        }
      })
      .catch(() => {
        // Nedostupný stav check-inu není důvod kartu skrýt — odeslání se
        // stejně zkusí a server případně přepíše dnešní řádek.
      })
      .finally(() => {
        if (zive) setNacitam(false);
      });
    return () => {
      zive = false;
    };
  }, []);

  async function uloz(noveHodnoceni: Hodnoceni, novyDuvod: Duvod | null) {
    setChyba(null);
    try {
      await apiFetch('/api/daily-checkin', {
        method: 'POST',
        body: JSON.stringify({ rating: noveHodnoceni, blocker: novyDuvod }),
      });
    } catch (e) {
      setChyba((e as Error)?.message || 'Odpověď se nepodařilo uložit.');
    }
  }

  // „Skvěle" nemá co blokovat — uloží se rovnou a karta je hotová.
  // U ostatních se ptáme na důvod, protože bez něj se nedá nic nabídnout.
  async function vyberHodnoceni(id: Hodnoceni) {
    setHodnoceni(id);
    if (id === 'great') {
      setDuvod(null);
      setHotovo(true);
      await uloz(id, null);
    }
  }

  async function vyberDuvod(id: Duvod) {
    setDuvod(id);
    setHotovo(true);
    if (hodnoceni) await uloz(hodnoceni, id);
  }

  if (nacitam) return null;

  const pomoc = duvod ? POMOC[duvod] : null;

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-povrch/95 border border-slate-800 shadow-xl">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-akcent-cyan shrink-0">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">
            {hotovo ? 'Díky, zapsáno' : 'Jak ti dnešek seděl?'}
          </h3>
          <p className="text-xs text-slate-400">
            {hotovo
              ? 'Podle odpovědí upravujeme, co ti nabídneme příště.'
              : 'Jedna odpověď. Podle ní víme, co ti nabídnout.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {HODNOCENI.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => vyberHodnoceni(o.id)}
            disabled={hotovo}
            aria-pressed={hodnoceni === o.id}
            className={`min-h-11 py-2.5 rounded-xl text-xs font-bold border transition-all disabled:cursor-default ${
              hodnoceni === o.id
                ? 'bg-cyan-950/70 border-cyan-500/60 text-akcent-cyan'
                : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-cyan-500/40 disabled:opacity-40'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {hodnoceni && hodnoceni !== 'great' && !duvod && (
        <div className="mt-4">
          <div className="text-xs font-bold text-slate-300 mb-2">Co stálo v cestě?</div>
          <div className="flex flex-wrap gap-2">
            {DUVODY.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => vyberDuvod(d.id)}
                className="min-h-11 py-2 px-3 rounded-xl text-xs font-semibold border bg-slate-900/70 border-slate-800 text-slate-300 hover:border-cyan-500/40 transition-all"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {hotovo && pomoc && (
        <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
          <p className="text-xs text-slate-300 leading-relaxed">{pomoc.text}</p>

          {pomoc.tlacitko && pomoc.zalozka && (
            <button
              type="button"
              onClick={() => onSelectTab(pomoc.zalozka as ActiveTab)}
              className="mt-3 min-h-11 w-full py-2 px-3 rounded-xl text-xs font-bold text-akcent-lime bg-lime-950/60 border border-lime-500/40 hover:bg-lime-900/60 transition-all inline-flex items-center justify-center gap-1.5"
            >
              <span>{pomoc.tlacitko}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          {duvod === 'technical_problem' && (
            <a
              href={`mailto:${KONTAKT}?subject=${encodeURIComponent('Něco v aplikaci nefunguje')}`}
              className="mt-3 min-h-11 w-full py-2 px-3 rounded-xl text-xs font-bold text-akcent-cyan bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/60 transition-all inline-flex items-center justify-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{KONTAKT}</span>
            </a>
          )}
        </div>
      )}

      {hotovo && hodnoceni === 'great' && (
        <p className="mt-4 text-xs text-slate-400 inline-flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-akcent-lime" />
          Takhle to má vypadat. Zítra pokračujeme.
        </p>
      )}

      {chyba && <p className="mt-3 text-xs text-amber-300">{chyba}</p>}
    </div>
  );
};
