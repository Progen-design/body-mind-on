import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  Shield,
  Unplug,
  Download,
  Loader2,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { motion } from 'motion/react';
import { SyncResult } from '../types';
import { useToast } from '../context/ToastContext';
import { hodnotaNeboPomlcka } from '../data/adaptery';
import { apiFetch } from '../lib/api';
import { odstupText } from '../lib/odstup';

/**
 * PŘIPOJENÍ WITHINGS — OAUTH, NE POLÍČKO NA TOKEN.
 *
 * Do 22. 9. 2026 byl tenhle modal kulisa. „Ověřit a připojit" vzalo jakýkoli
 * řetězec delší než 12 znaků bez mezer, počkalo 1200 ms a lokálně si napsalo
 * `isConnected: true`. Na server se neposlalo nic. Stav připojení žil
 * v `useLocalStorage`, takže s tabulkou `withings_connections` neměl nic
 * společného, a uživatel četl „Aktivní & Spárováno" nad vymyšlenou baterií
 * „92 %" a Wi-Fi „Silný (5 GHz)" — obojí natvrdo v JSX, appka ta data
 * od Withings vůbec nedostává.
 *
 * Proto měla `withings_connections` nula řádků: skutečný OAuth
 * (`/api/withings/connect` → Withings → `/api/withings/callback`) existoval
 * a fungoval, jen na něj z aplikace nikdy nevedla cesta.
 *
 * PROČ SE NEPŘESMĚROVÁVÁ ROVNOU NA `/api/withings/connect`. Endpoint čte
 * přihlášení z hlavičky `Authorization: Bearer …` (`getAuthUserFromRequest`),
 * a tu obyčejná navigace prohlížeče neposílá — skončila by na
 * `/login?withings=login_required`. Posílá se tedy POST přes `apiFetch`
 * (ten hlavičku doplní), server vrátí `url` do Withings a teprve na tu se
 * prohlížeč přesměruje.
 *
 * STAV PŘIPOJENÍ SI TENHLE MODAL NEDRŽÍ. Jediný zdroj pravdy je
 * `has_withings_connection` z `/api/profile` — tedy existence řádku
 * ve `withings_connections`. Modal ho dostává propem a po odpojení si
 * o čerstvý profil řekne přes `onConnectionChanged`.
 */
interface WithingsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** `profilData.has_withings_connection` — existence řádku ve `withings_connections`. */
  isConnected: boolean;
  /** `profilData.withings_last_sync_at`. null = server zatím nestahoval. */
  lastSyncedAt: string | null;
  /** Vrací souhrn stažených dat — zapisuje je do stavu aplikace. */
  onManualSync: () => Promise<SyncResult | null>;
  /** Znovu načte profil, aby se stav připojení po odpojení nezasekl. */
  onConnectionChanged: () => void;
  isSyncing?: boolean;
}

export const WithingsSyncModal: React.FC<WithingsSyncModalProps> = ({
  isOpen,
  onClose,
  isConnected,
  lastSyncedAt,
  onManualSync,
  onConnectionChanged,
  isSyncing = false
}) => {
  const { showToast } = useToast();

  const [jdeNaWithings, setJdeNaWithings] = useState(false);
  const [odpojuje, setOdpojuje] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    if (!isOpen) setLastResult(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setJdeNaWithings(true);
    try {
      const odpoved = await apiFetch<{ url?: string }>('/api/withings/connect', { method: 'POST' });
      if (!odpoved?.url) throw new Error('Server nevrátil adresu pro přihlášení k Withings.');
      // Odchod z aplikace. Stav připojení se tu nenastavuje — vznikne až tím,
      // že callback uloží řádek do `withings_connections`.
      window.location.href = odpoved.url;
    } catch (err) {
      setJdeNaWithings(false);
      showToast({
        title: 'Připojení se nepodařilo spustit',
        description: err instanceof Error ? err.message : 'Zkus to prosím za chvíli znovu.',
        variant: 'error'
      });
    }
  };

  const handleDisconnect = async () => {
    setOdpojuje(true);
    try {
      await apiFetch('/api/withings/disconnect', { method: 'POST' });
      onConnectionChanged();
      setLastResult(null);
      showToast({
        title: 'Withings odpojen',
        description: 'Přístup jsme na serveru zrušili, data se přestanou stahovat.',
        variant: 'info'
      });
    } catch (err) {
      showToast({
        title: 'Odpojení se nepodařilo',
        description: err instanceof Error ? err.message : 'Zkus to prosím za chvíli znovu.',
        variant: 'error'
      });
    } finally {
      setOdpojuje(false);
    }
  };

  const handleDownload = async () => {
    if (!isConnected || isSyncing) return;
    setLastResult(null);
    const result = await onManualSync();
    setLastResult(result);
  };

  // Odstup je naměřený fakt. Rozvrh, jak často server stahuje, se netvrdí.
  const odstupStazeni = odstupText(lastSyncedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-lg max-h-[90vh] bg-povrch rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,242,254,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-akcent-cyan">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Připojení Withings
              </h3>
              {/* Model zařízení neznáme — z Withings chodí měření, ne název
                  váhy. „Withings Body Scan Pro" tu bylo natvrdo. */}
              <p className="text-xs text-slate-400">
                Vážení a biometrie z účtu Withings
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all"
            aria-label="Zavřít"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Stav připojení. Zdroj je server, ne tenhle modal. */}
          <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-white">Stav připojení</span>
              {isConnected ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-akcent-lime bg-emerald-950/60 border border-emerald-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-akcent-lime animate-pulse" />
                  Aktivní &amp; Spárováno
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-amber-300 bg-amber-950/50 border border-amber-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Nepřipojeno
                </span>
              )}
            </div>

            {/* Baterie a Wi-Fi signál tu byly natvrdo („92 %", „Silný (5 GHz)").
                Withings nám nic takového neposílá, takže se nezobrazuje nic —
                jediné, co o spojení opravdu víme, je kdy server naposled
                stahoval. */}
            <div className="text-xs text-slate-400">
              {isConnected
                ? odstupStazeni
                  ? `Server naposled stahoval ${odstupStazeni}`
                  : 'Připojeno, zatím ale žádné stažení neproběhlo'
                : 'Účet Withings zatím není propojený.'}
            </div>
          </div>

          {/* Propojení účtu */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-akcent-cyan" />
              <div>
                <div className="text-sm font-semibold text-white">Propojení účtu</div>
                <div className="text-xs text-slate-400">
                  Přihlásíš se přímo u Withings. Heslo ani token do aplikace nezadáváš.
                </div>
              </div>
            </div>

            {isConnected ? (
              <button
                onClick={handleDisconnect}
                disabled={odpojuje}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-red-300 bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {odpojuje ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                <span>{odpojuje ? 'Odpojuji…' : 'Odpojit Withings'}</span>
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={jdeNaWithings}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-950 bg-akcent-cyan hover:bg-akcent-cyan/90 disabled:bg-slate-800 disabled:text-slate-500 shadow-[0_0_15px_rgba(0,242,254,0.25)] disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {jdeNaWithings ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Přesměrovávám na Withings…</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    <span>Připojit přes Withings</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Stažení dat */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-akcent-lime" />
              <div>
                <div className="text-sm font-semibold text-white">Stažení dat ze zařízení</div>
                <div className="text-xs text-slate-400">
                  Vážení z váhy a biometrie z hodinek se zapíší rovnou do profilu
                </div>
              </div>
            </div>

            <button
              onClick={handleDownload}
              disabled={!isConnected || isSyncing}
              className="w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 disabled:opacity-50 disabled:hover:bg-slate-900 disabled:hover:border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  {/* Kroky „Ověřuji přístupový token…" a spol. tu běžely na
                      timerech, ne podle toho, co server dělal. */}
                  <span>Stahuji z Withings…</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-slate-400" />
                  <span>Stáhnout data teď</span>
                </>
              )}
            </button>

            {!isConnected && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Nejdřív propoj účet Withings — bez něj se data stáhnout nedají.</span>
              </div>
            )}

            {lastResult && !isSyncing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-akcent-lime">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Staženo v {lastResult.syncedAt}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: 'Váha', value: hodnotaNeboPomlcka(lastResult.weight, 'kg') },
                    { label: 'Klidový tep', value: hodnotaNeboPomlcka(lastResult.restingHrBpm, 'bpm', 0) },
                    { label: 'HRV', value: hodnotaNeboPomlcka(lastResult.hrvMs, 'ms') },
                    { label: 'Kroky', value: lastResult.steps.toLocaleString('cs-CZ') },
                    { label: 'Aktivní energie', value: `${lastResult.activeEnergyKcal} kcal` }
                  ].map(item => (
                    <div key={item.label} className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
                      <div className="text-[10px] text-slate-400">{item.label}</div>
                      <div className="text-xs font-bold text-white">{item.value}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-1 min-w-0">
            <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            {/* Dřív tu stálo „Token zůstává jen na tomto zařízení" — a byla to
                pravda přesně proto, že se nikam neposílal a nic nepřipojoval. */}
            <span className="truncate">Přístup můžeš kdykoli odpojit</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-akcent-cyan to-akcent-lime shrink-0"
          >
            Hotovo
          </button>
        </div>
      </motion.div>
    </div>
  );
};
