import React from 'react';
import { Watch, Copy, Check, KeyRound, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';

// PROPOJENÍ HODINEK — CHYBĚLO TLAČÍTKO, NE FUNKCE.
//
// Server uměl připojení vyrobit už dřív (POST /api/health/connections/rotate
// vrátí jednorázový API klíč), ale v aplikaci na to nikde nevedla cesta.
// Karta zařízení uměla říct „Zatím žádná data z hodinek" a poradit „nastav
// odesílání v Health Auto Export" — jenže bez adresy a bez klíče se to
// nastavit nedá. Uživatel tak měl návod na krok, který nešel udělat.
//
// PROČ TO NEJDE JEDNÍM KLIKEM. Apple nedovolí číst HealthKit ze serveru,
// takže data musí odesílat telefon. Jediné, co aplikace může udělat, je
// vyrobit klíč a ukázat adresu — zbytek se zadává v Health Auto Export.
//
// KLÍČ SE UKAZUJE JEN JEDNOU. Server si ukládá jen jeho hash, takže zpětně
// ho nikdo nepřečte. Proto je u něj varování a tlačítko na zkopírování;
// když se ztratí, vyrobí se nový přes stejné tlačítko (staré se zruší).

interface OdpovedPripojeni {
  ok?: boolean;
  api_key?: string;
  ingest_url?: string;
  warning?: string;
  connection?: { id?: string; api_key_prefix?: string | null };
}

interface StavPripojeni {
  active?: { id?: string; api_key_prefix?: string | null; status?: string | null } | null;
}

/** Zkopíruje text a na dvě vteřiny to potvrdí. */
function useKopirovani(): [string | null, (klic: string, text: string) => void] {
  const [zkopirovano, setZkopirovano] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!zkopirovano) return;
    const t = window.setTimeout(() => setZkopirovano(null), 2000);
    return () => window.clearTimeout(t);
  }, [zkopirovano]);

  const kopiruj = React.useCallback((klic: string, text: string) => {
    // Clipboard API neexistuje na http:// ani ve starších WebView. Když
    // selže, pole je stejně vybíratelné myší, takže se jen nic nepotvrdí.
    navigator.clipboard?.writeText(text).then(
      () => setZkopirovano(klic),
      () => setZkopirovano(null)
    );
  }, []);

  return [zkopirovano, kopiruj];
}

function PoleKeZkopirovani({
  popisek,
  hodnota,
  klic,
  zkopirovano,
  onKopiruj,
}: {
  popisek: string;
  hodnota: string;
  klic: string;
  zkopirovano: string | null;
  onKopiruj: (klic: string, text: string) => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-400 mb-1">{popisek}</div>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-200 break-all select-all">
          {hodnota}
        </code>
        <button
          type="button"
          onClick={() => onKopiruj(klic, hodnota)}
          className="shrink-0 px-3 rounded-xl border border-cyan-500/40 bg-cyan-950/60 text-akcent-cyan hover:bg-cyan-900/60 transition-all"
          title={`Zkopírovat ${popisek.toLowerCase()}`}
        >
          {zkopirovano === klic ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export const PripojitHodinky: React.FC = () => {
  const [stav, setStav] = React.useState<StavPripojeni | null>(null);
  const [vysledek, setVysledek] = React.useState<OdpovedPripojeni | null>(null);
  const [pracuji, setPracuji] = React.useState(false);
  const [chyba, setChyba] = React.useState<string | null>(null);
  const [zkopirovano, kopiruj] = useKopirovani();

  React.useEffect(() => {
    let zive = true;
    apiFetch<StavPripojeni>('/api/health/connection')
      .then((data) => {
        if (zive) setStav(data);
      })
      .catch(() => {
        // Stav připojení není nutný k tomu, aby šlo klíč vyrobit — tlačítko
        // se ukáže i tak, jen bez informace o už existujícím klíči.
        if (zive) setStav(null);
      });
    return () => {
      zive = false;
    };
  }, []);

  const jePripojeno = stav?.active?.status === 'active';

  async function vyrobKlic() {
    setPracuji(true);
    setChyba(null);
    try {
      const odpoved = await apiFetch<OdpovedPripojeni>('/api/health/connections/rotate', {
        method: 'POST',
        body: JSON.stringify(
          stav?.active?.id ? { connection_id: stav.active.id } : { device_label: 'iPhone' }
        ),
      });
      setVysledek(odpoved);
      if (odpoved.connection?.id) {
        setStav({ active: { ...odpoved.connection, status: 'active' } });
      }
    } catch (e) {
      setChyba((e as Error)?.message || 'Klíč se nepodařilo vytvořit.');
    } finally {
      setPracuji(false);
    }
  }

  return (
    <div className="mt-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
      <div className="flex items-start gap-2.5">
        <Watch className="w-4 h-4 text-akcent-lime shrink-0 mt-0.5" />
        <div className="text-[11px] text-slate-300 leading-relaxed">
          Data z hodinek posílá iPhone, ne server. Vygeneruj si klíč a vlož ho
          i s adresou do aplikace <strong className="text-white">Health Auto Export</strong> —
          hodinky se pak přidají samy.
        </div>
      </div>

      {!vysledek && (
        <button
          type="button"
          onClick={vyrobKlic}
          disabled={pracuji}
          className="w-full py-2 px-3 rounded-xl text-[11px] font-bold text-akcent-lime bg-lime-950/60 border border-lime-500/40 hover:bg-lime-900/60 disabled:opacity-50 transition-all active:scale-[0.99] inline-flex items-center justify-center gap-1.5"
        >
          {pracuji ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <KeyRound className="w-3.5 h-3.5" />
          )}
          <span>
            {pracuji
              ? 'Generuji klíč…'
              : jePripojeno
                ? 'Vygenerovat nový klíč'
                : 'Připojit hodinky'}
          </span>
        </button>
      )}

      {jePripojeno && !vysledek && (
        <p className="text-[11px] text-slate-500">
          Klíč už jednou vygenerovaný byl (
          <code className="text-slate-400">{stav?.active?.api_key_prefix}…</code>). Nový ho
          nahradí a v telefonu ho bude potřeba přepsat.
        </p>
      )}

      {chyba && (
        <div className="text-[11px] text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{chyba}</span>
        </div>
      )}

      {vysledek?.api_key && (
        <div className="space-y-3">
          <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-200 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Klíč vidíš jenom teď. Ulož si ho — zpětně ho nepřečteme, dá se
              jen vygenerovat nový.
            </span>
          </div>

          {vysledek.warning && (
            <div className="text-[11px] text-amber-300">{vysledek.warning}</div>
          )}

          {vysledek.ingest_url && (
            <PoleKeZkopirovani
              popisek="Adresa (URL)"
              hodnota={vysledek.ingest_url}
              klic="url"
              zkopirovano={zkopirovano}
              onKopiruj={kopiruj}
            />
          )}

          <PoleKeZkopirovani
            popisek="API klíč"
            hodnota={vysledek.api_key}
            klic="klic"
            zkopirovano={zkopirovano}
            onKopiruj={kopiruj}
          />

          <div className="text-[11px] text-slate-400 leading-relaxed">
            <div className="font-semibold text-slate-300 mb-1">V telefonu pak:</div>
            <ol className="space-y-1 list-decimal list-inside marker:text-slate-600">
              <li>Otevři aplikaci Health Auto Export.</li>
              <li>
                Vytvoř <span className="text-slate-300">Automation</span> typu
                {' '}<span className="text-slate-300">REST API</span>.
              </li>
              <li>Do pole URL vlož adresu výše, metoda POST, formát JSON.</li>
              <li>
                Přidej hlavičku <code className="text-slate-300">x-api-key</code> s klíčem výše.
              </li>
              <li>Ulož a spusť první export — data se objeví do pár minut.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};
