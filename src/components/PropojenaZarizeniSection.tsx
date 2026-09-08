import React from 'react';
import { Scale, Watch, RefreshCw, AlertTriangle } from 'lucide-react';
import { TelesneSlozeni } from '../types';
import { kdyMereno } from '../data/adaptery';
import { odstupHodin, odstupText } from '../lib/odstup';
import { NabidkaPropojeni } from './NabidkaPropojeni';

/**
 * PROPOJENÁ CHYTRÁ ZAŘÍZENÍ & DATA.
 *
 * Do 9. 9. 2026 byla tahle sekce součástí `ProfileSection` a kreslila se
 * hned pod cíli a makry — tedy nad jídelníčkem a tréninkem. Většina
 * uživatelů žádné zařízení připojené nemá a viděla uprostřed profilu dvě
 * prázdné dlaždice dřív než to, kvůli čemu do aplikace chodí.
 *
 * Sekce je proto samostatná komponenta: `App` ji kreslí až úplně na konci
 * záložky Můj profil, pod bento mřížkou. Jinak by musela zůstat uvnitř
 * `ProfileSection` a nešla by dostat pod komponentu, která je za ní.
 */
interface PropojenaZarizeniSectionProps {
  // Z chytré váhy. null = váha zatím nic nezměřila.
  slozeni?: TelesneSlozeni | null;
  /** ISO čas posledního přijatého payloadu z Apple Health. null = zatím nic nedorazilo. */
  posledniSynchronizace?: string | null;
  /** ISO čas posledního stažení z Withings. null = server zatím nestahoval. */
  withingsPosledniStazeni?: string | null;
  /** Otevře modal pro propojení Withings. Bez něj se u nepřipojené váhy nedá nic udělat. */
  onOpenWithingsSettings?: () => void;
  onSyncAll: () => void;
  isSyncing?: boolean;
}

/**
 * PROČ PRÁVĚ DVANÁCT HODIN. Auto Export v telefonu odesílá po hodině, takže
 * dvanáct hodin ticha znamená dvanáct zmeškaných pokusů v řadě — to už není
 * výpadek Wi-Fi, ale zaseknuté odesílání. Kratší práh by hlásil poplach přes
 * noc, kdy iOS aplikaci na pozadí běžně uspí.
 */
const HODIN_DO_ZASTARANI = 12;

export const PropojenaZarizeniSection: React.FC<PropojenaZarizeniSectionProps> = ({
  slozeni = null,
  posledniSynchronizace = null,
  withingsPosledniStazeni = null,
  onOpenWithingsSettings,
  onSyncAll,
  isSyncing = false
}) => {
  // ODSTUP SE POČÍTÁ, INTERVAL SE NETVRDÍ.
  //
  // Změřeno 24. 8. 2026 v 08:20: posledních 8 payloadů dorazilo mezi
  // 23:07:00 a 23:08:08 — jedna dávka za 68 sekund, ne hodinová úloha. Pak
  // devět hodin ticho. Žádnou pravidelnou frekvenci tedy tvrdit nemůžeme;
  // víme jen, kdy dorazila poslední dávka. Odznak proto neříká verdikt
  // („Aktuální"), ale naměřený odstup.
  const { zdraviPosledni, zdraviOdstup, zdraviZastarale } = React.useMemo(() => {
    const iso = posledniSynchronizace || null;
    const stariHodin = odstupHodin(iso);
    if (stariHodin === null) {
      return { zdraviPosledni: null, zdraviOdstup: '', zdraviZastarale: false };
    }
    return {
      zdraviPosledni: iso,
      zdraviOdstup: odstupText(iso),
      zdraviZastarale: stariHodin > HODIN_DO_ZASTARANI,
    };
  }, [posledniSynchronizace]);

  /** Kdy server naposled opravdu stahoval z Withings. Prázdno = nevíme. */
  const withingsOdstup = React.useMemo(
    () => odstupText(withingsPosledniStazeni),
    [withingsPosledniStazeni],
  );

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-povrch/90 border border-slate-800 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400">
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Propojená chytrá zařízení &amp; Data</h3>
            {/* „Obousměrný" přenos nebyl — data chodí ze zařízení k nám,
                zpátky se neposílá nic. */}
            <p className="text-xs text-slate-400">Měření z Withings a Apple Health se stahují při synchronizaci</p>
          </div>
        </div>
        <button
          onClick={onSyncAll}
          disabled={isSyncing}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-950/70 hover:bg-cyan-900/70 text-akcent-cyan border border-cyan-500/40 shadow-sm transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Synchronizuji...' : 'Synchronizovat teď'}</span>
        </button>
      </div>

      {/* DVĚ ZAŘÍZENÍ, NE TŘI.
          Do 23. 8. 2026 tu byla jako třetí dlaždice karta „AI trenér TED".
          TED není zařízení a nic nesynchronizuje. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* STAV ZAŘÍZENÍ SE ODVOZUJE Z DAT, KTERÁ OPRAVDU DORAZILA.
            Do 23. 8. 2026 tu svítilo „Připojeno" u obou zařízení natvrdo —
            každému uživateli, i tomu, který nikdy nic nepřipojil. */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-akcent-cyan shrink-0">
                <Scale className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-200">Withings Body Scan</div>
                <div className="text-[11px] text-slate-400">
                  {slozeni
                    ? `Poslední vážení ${kdyMereno(slozeni.measured_at)}`
                    : 'Zatím žádné měření'}
                </div>
              </div>
            </div>
            {slozeni && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold text-akcent-lime bg-emerald-950/60 border border-emerald-500/30">
                Připojeno
              </span>
            )}
          </div>
          {/* KDY SERVER OPRAVDU STAHOVAL, NE JAK ČASTO HO TO MÁ NAPLÁNOVANÉ.
              Do 25. 8. 2026 tu stálo „Stahuje se automaticky každou hodinu".
              To je rozvrh cronu, ne záznam o tom, že proběhl. */}
          <div className="text-[11px] text-emerald-400/90 mt-2 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3 shrink-0" />
            <span>
              {withingsOdstup
                ? `Server naposled stahoval ${withingsOdstup}`
                : 'Stahuje server sám, zatím ale žádné stažení neproběhlo'}
            </span>
          </div>
          {/* CESTA K PROPOJENÍ PŘÍMO TADY. Karta uměla říct „Zatím žádné
              měření", ale ne co s tím. */}
          {!slozeni && onOpenWithingsSettings && (
            <button
              type="button"
              onClick={onOpenWithingsSettings}
              className="mt-3 w-full py-2 px-3 rounded-xl text-[11px] font-bold text-akcent-cyan bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/60 transition-all active:scale-[0.99]"
            >
              Připojit Withings
            </button>
          )}
        </div>

        {/* APPLE HEALTH — DATA POSÍLÁ TELEFON, SERVER SI JE NEVYŽÁDÁ.
            Apple neumožňuje číst HealthKit ze serveru, takže tenhle kanál
            nejde automatizovat z naší strany; export musí spustit iPhone. */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-lime-950/50 border border-lime-500/30 flex items-center justify-center text-akcent-lime shrink-0">
                <Watch className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-200">Apple Health</div>
                {/* Odstup je to podstatné, přesný čas jde vidět v titulku. */}
                <div className="text-[11px] text-slate-400" title={kdyMereno(zdraviPosledni)}>
                  {zdraviPosledni
                    ? `Poslední odeslání ${zdraviOdstup}`
                    : 'Zatím žádná data z hodinek'}
                </div>
              </div>
            </div>
            {/* ODZNAK UKAZUJE ODSTUP, NE VERDIKT. */}
            {zdraviPosledni && (
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  zdraviZastarale
                    ? 'text-amber-300 bg-amber-950/60 border-amber-500/40'
                    : 'text-slate-300 bg-slate-800/80 border-slate-600/50'
                }`}
              >
                {zdraviOdstup}
              </span>
            )}
          </div>
          <div className={`text-[11px] mt-2 flex items-start gap-1.5 ${zdraviZastarale ? 'text-amber-300' : 'text-slate-500'}`}>
            {zdraviZastarale
              ? <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              : <RefreshCw className="w-3 h-3 shrink-0 mt-0.5" />}
            <span>
              {/* ŽÁDNÁ FREKVENCE. Věta „Odesílá tvůj iPhone každou hodinu"
                  tvrdila rozvrh, který měření nepotvrdilo. Co platí pořád,
                  je SMĚR: server si data vyžádat neumí. */}
              {zdraviZastarale
                ? `Přes ${HODIN_DO_ZASTARANI} hodin nepřišlo nic. Odesílá iPhone, ne server — zkontroluj Auto Export v telefonu.`
                : 'Odesílá iPhone, server si data stáhnout nemůže'}
            </span>
          </div>
          {/* U hodinek se nedá nabídnout tlačítko: Apple neumožňuje číst
              HealthKit ze serveru, takže propojení spustí jedině telefon. */}
          {!zdraviPosledni && (
            <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              Data posílá iPhone, ne server. V aplikaci Health Auto Export
              nastav odesílání na Body &amp; Mind ON a hodinky se přidají samy.
            </div>
          )}
        </div>
      </div>

      {/* Nabídka pomoci se ukáže, jen když aspoň jedno zařízení chybí —
          komu obojí chodí, ten ji číst nepotřebuje. */}
      {(!slozeni || !zdraviPosledni) && (
        <div className="mt-3.5">
          <NabidkaPropojeni kompaktni />
        </div>
      )}
    </div>
  );
};
