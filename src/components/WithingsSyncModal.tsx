import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Wifi,
  Battery,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  Unplug,
  Download,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'motion/react';
import { SyncResult, WithingsConnection } from '../types';
import { useToast } from '../context/ToastContext';
import { hodnotaNeboPomlcka } from '../data/adaptery';

interface WithingsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: WithingsConnection;
  onConnectionChange: (next: WithingsConnection) => void;
  /** Vrací souhrn stažených dat — zapisuje je do stavu aplikace. */
  onManualSync: () => Promise<SyncResult | null>;
  isSyncing?: boolean;
}

/** Kroky "živého" stahování z Withings Cloud. */
const DOWNLOAD_STEPS = [
  'Ověřuji přístupový token…',
  'Navazuji spojení s Withings Cloud…',
  'Stahuji poslední vážení z Body Scan…',
  'Načítám tep, HRV a kroky z hodinek…',
  'Zapisuji měření do profilu…'
];

const MIN_TOKEN_LENGTH = 12;

function maskToken(token: string): string {
  const tail = token.slice(-4);
  return `${'•'.repeat(Math.min(16, Math.max(4, token.length - 4)))}${tail}`;
}

export const WithingsSyncModal: React.FC<WithingsSyncModalProps> = ({
  isOpen,
  onClose,
  connection,
  onConnectionChange,
  onManualSync,
  isSyncing = false
}) => {
  const { showToast } = useToast();

  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const [downloadStep, setDownloadStep] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  // Timery je nutné uklidit, aby po zavření modálu nedoběhly do odmontované komponenty.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  useEffect(() => {
    if (!isOpen) {
      setTokenError(null);
      setShowToken(false);
      setDownloadStep(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const wait = (ms: number) =>
    new Promise<void>(resolve => {
      const t = setTimeout(resolve, ms);
      timers.current.push(t);
    });

  const handleAuthorize = async () => {
    const token = tokenInput.trim();

    if (token.length < MIN_TOKEN_LENGTH) {
      setTokenError(`Token je příliš krátký — očekáváme alespoň ${MIN_TOKEN_LENGTH} znaků.`);
      return;
    }
    if (/\s/.test(token)) {
      setTokenError('Token nesmí obsahovat mezery. Zkopíruj ho znovu z Withings Developer Portalu.');
      return;
    }

    setTokenError(null);
    setIsAuthorizing(true);
    await wait(1200);

    onConnectionChange({
      ...connection,
      maskedToken: maskToken(token),
      isConnected: true,
      lastAuthorizedAt: new Date().toISOString()
    });

    setIsAuthorizing(false);
    setTokenInput('');
    setShowToken(false);
    showToast({
      title: 'Withings připojen',
      description: 'Token byl ověřen, můžeš stáhnout data.',
      variant: 'success'
    });
  };

  const handleDisconnect = () => {
    onConnectionChange({
      ...connection,
      maskedToken: '',
      isConnected: false,
      lastAuthorizedAt: null
    });
    setLastResult(null);
    showToast({
      title: 'Withings odpojen',
      description: 'Token byl odstraněn ze zařízení.',
      variant: 'info'
    });
  };

  const handleLiveDownload = async () => {
    if (!connection.isConnected || downloadStep !== null) return;

    setLastResult(null);
    for (let i = 0; i < DOWNLOAD_STEPS.length - 1; i++) {
      setDownloadStep(i);
      await wait(420);
    }

    // Poslední krok už skutečně zapisuje data do stavu aplikace.
    setDownloadStep(DOWNLOAD_STEPS.length - 1);
    const result = await onManualSync();
    await wait(320);

    setDownloadStep(null);
    setLastResult(result);
  };

  const isDownloading = downloadStep !== null;
  const progressPercent = isDownloading
    ? Math.round(((downloadStep! + 1) / DOWNLOAD_STEPS.length) * 100)
    : 0;

  const authorizedText = connection.lastAuthorizedAt
    ? new Date(connection.lastAuthorizedAt).toLocaleString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

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
        className="relative z-10 w-full max-w-lg max-h-[90vh] bg-[#0c1017] rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,242,254,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Integrace Withings Health
              </h3>
              <p className="text-xs text-slate-400">
                Připojené zařízení: Withings Body Scan Pro
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
          {/* Device status card */}
          <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-white">Stav připojení</span>
              {connection.isConnected ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-pulse" />
                  Aktivní &amp; Spárováno
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-amber-300 bg-amber-950/50 border border-amber-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Nepřipojeno
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center gap-2">
                <Battery className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-[10px] text-slate-400">Stav baterie</div>
                  <div className="text-xs font-bold text-white">92 %</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="text-[10px] text-slate-400">Wi-Fi signál</div>
                  <div className="text-xs font-bold text-white">Silný (5 GHz)</div>
                </div>
              </div>
            </div>
          </div>

          {/* API token */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#00f2fe]" />
              <div>
                <div className="text-sm font-semibold text-white">Přístupový token Withings API</div>
                <div className="text-xs text-slate-400">
                  Zkopíruj access token z Withings Developer Portalu
                </div>
              </div>
            </div>

            {connection.isConnected && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400">Uložený token</div>
                  <div className="text-xs font-mono font-bold text-slate-200 truncate">
                    {connection.maskedToken || '••••••••'}
                  </div>
                  {authorizedText && (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Autorizováno {authorizedText}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-300 bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 transition-all active:scale-95 shrink-0"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span>Odpojit</span>
                </button>
              </div>
            )}

            <div className="space-y-2">
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={e => {
                    setTokenInput(e.target.value);
                    if (tokenError) setTokenError(null);
                  }}
                  placeholder={connection.isConnected ? 'Vložit nový token…' : 'wth_at_…'}
                  autoComplete="off"
                  spellCheck={false}
                  className={`w-full pl-3 pr-11 py-2.5 rounded-xl bg-slate-950 border text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition-all focus:border-cyan-500/60 focus:shadow-[0_0_12px_rgba(0,242,254,0.15)] ${
                    tokenError ? 'border-red-500/60' : 'border-slate-800'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(prev => !prev)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all"
                  aria-label={showToken ? 'Skrýt token' : 'Zobrazit token'}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {tokenError && (
                <div className="flex items-start gap-1.5 text-[11px] text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{tokenError}</span>
                </div>
              )}

              <button
                onClick={handleAuthorize}
                disabled={isAuthorizing || tokenInput.trim().length === 0}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-950 bg-[#00f2fe] hover:bg-[#00f2fe]/90 disabled:bg-slate-800 disabled:text-slate-500 shadow-[0_0_15px_rgba(0,242,254,0.25)] disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isAuthorizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Ověřuji token u Withings…</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>{connection.isConnected ? 'Nahradit token' : 'Ověřit a připojit'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sync toggles */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Automatická ranní synchronizace</div>
                <div className="text-xs text-slate-400">Ihned po stoupnutí na váhu odeslat data trenérovi</div>
              </div>
              <button
                onClick={() =>
                  onConnectionChange({ ...connection, autoSyncEnabled: !connection.autoSyncEnabled })
                }
                aria-pressed={connection.autoSyncEnabled}
                aria-label="Automatická ranní synchronizace"
                className={`w-12 h-6 shrink-0 rounded-full transition-colors p-1 flex items-center ${
                  connection.autoSyncEnabled ? 'bg-[#00f2fe] justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <motion.div layout className="w-4 h-4 rounded-full bg-slate-950 shadow-md" />
              </button>
            </div>
          </div>

          {/* Živé stahování dat */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[#39ff14]" />
              <div>
                <div className="text-sm font-semibold text-white">Stažení dat ze zařízení</div>
                <div className="text-xs text-slate-400">
                  Vážení z Body Scan a biometrie z hodinek se zapíší rovnou do profilu
                </div>
              </div>
            </div>

            <button
              onClick={handleLiveDownload}
              disabled={!connection.isConnected || isDownloading || isSyncing}
              className="w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 disabled:opacity-50 disabled:hover:bg-slate-900 disabled:hover:border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              {isDownloading || isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span>{DOWNLOAD_STEPS[downloadStep ?? 0]}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-slate-400" />
                  <span>Stáhnout data teď</span>
                </>
              )}
            </button>

            {!connection.isConnected && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Nejdřív vlož a ověř přístupový token — bez něj se data stáhnout nedají.</span>
              </div>
            )}

            {isDownloading && (
              <div className="space-y-1.5">
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#00f2fe] to-[#39ff14]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.35 }}
                  />
                </div>
                <div className="text-[10px] text-slate-500 text-right font-mono">
                  {progressPercent} %
                </div>
              </div>
            )}

            {lastResult && !isDownloading && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#39ff14]">
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
            <span className="truncate">Token zůstává jen na tomto zařízení</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#39ff14] shrink-0"
          >
            Hotovo
          </button>
        </div>
      </motion.div>
    </div>
  );
};
