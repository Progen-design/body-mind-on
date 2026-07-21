import { useEffect, useMemo, useState } from 'react';
import {
  getProfileDevices,
  hasDeviceInterest,
  wantsDevice,
} from '../../lib/registrationDevices';

function formatRelativeCs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return 'právě teď';
  if (diffMin < 60) return `před ${diffMin} min`;
  const hours = Math.round(diffMin / 60);
  if (hours < 48) return `před ${hours} h`;
  const days = Math.round(hours / 24);
  return `před ${days} dny`;
}

function ingestEndpointUrl() {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) return 'https://<tvůj-projekt>.supabase.co/functions/v1/apple-health-ingest';
  return `${base}/functions/v1/apple-health-ingest`;
}

/**
 * Profile section: connect Withings / Apple Watch after registration.
 * Connected devices render a compact status row; setup cards only when disconnected.
 */
export default function ConnectDevicesSection({
  profile,
  session,
  healthConnection,
  onAppleKeyCreated,
}) {
  const devices = getProfileDevices(profile);
  const highlight = hasDeviceInterest(devices);
  const withingsConnected = profile?.has_withings_connection === true;

  const activeApple = healthConnection?.active?.status === 'active'
    ? healthConnection.active
    : null;

  const [withingsMsg, setWithingsMsg] = useState('');
  const [manageWithings, setManageWithings] = useState(false);
  const [manageApple, setManageApple] = useState(false);
  const [watchStep, setWatchStep] = useState(1);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchError, setWatchError] = useState('');
  const [apiKeyOnce, setApiKeyOnce] = useState('');
  const [connectionId, setConnectionId] = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (activeApple?.id) {
      setConnectionId(activeApple.id);
      if (!manageApple && !apiKeyOnce) {
        setWatchStep(0);
      }
      return;
    }
    if (!apiKeyOnce && watchStep === 0) {
      setWatchStep(1);
    }
  }, [activeApple?.id, manageApple, apiKeyOnce, watchStep]);

  const endpoint = useMemo(() => ingestEndpointUrl(), []);
  const lastSyncLabel = formatRelativeCs(activeApple?.last_sync_at)
    || healthConnection?.meta?.last_sync_relative
    || null;

  const appleConnectedCompact = Boolean(activeApple) && !manageApple && !apiKeyOnce && watchStep === 0;
  const withingsConnectedCompact = withingsConnected && !manageWithings;
  const bothConnectedCompact = appleConnectedCompact && withingsConnectedCompact;

  async function startWithings() {
    const token = session?.access_token;
    if (!token) return;
    setWithingsMsg('');
    try {
      const res = await fetch('/api/withings/connect?format=json&return_to=/profil', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Nelze spustit propojení Withings.');
      window.location.href = json.url;
    } catch (err) {
      setWithingsMsg(err?.message || 'Nelze spustit propojení Withings.');
    }
  }

  async function generateAppleKey() {
    const token = session?.access_token;
    if (!token) return;
    setWatchBusy(true);
    setWatchError('');
    setApiKeyOnce('');
    try {
      const body = connectionId || activeApple?.id
        ? { connection_id: connectionId || activeApple.id }
        : { device_label: 'iPhone' };
      const res = await fetch('/api/health/connections/rotate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.api_key) {
        throw new Error(json?.error || 'Nepodařilo se vygenerovat API klíč.');
      }
      setApiKeyOnce(json.api_key);
      setConnectionId(json.connection?.id || null);
      setWatchStep(3);
      if (typeof onAppleKeyCreated === 'function') onAppleKeyCreated(json);
    } catch (err) {
      setWatchError(err?.message || 'Nepodařilo se vygenerovat API klíč.');
    } finally {
      setWatchBusy(false);
    }
  }

  async function copyText(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  }

  function openAppleManage() {
    setManageApple(true);
    setWatchStep(1);
    setWatchError('');
    setApiKeyOnce('');
  }

  function closeAppleManage() {
    setManageApple(false);
    setApiKeyOnce('');
    setWatchError('');
    setWatchStep(activeApple ? 0 : 1);
  }

  return (
    <section
      className={`connect-devices${highlight ? ' connect-devices--highlight' : ''}`}
      aria-labelledby="connect-devices-heading"
    >
      <header className="connect-devices-head">
        <div>
          <h2 id="connect-devices-heading">
            {bothConnectedCompact ? 'Zařízení' : 'Připojit zařízení'}
          </h2>
          {!bothConnectedCompact ? (
            <p>
              Stačí jedno číslo týdně — a s chytrým zařízením ani to ne.
              Připojení je volitelné a můžeš ho udělat kdykoli.
            </p>
          ) : null}
        </div>
        {highlight && !bothConnectedCompact ? (
          <span className="connect-devices-badge">Zmíněno při registraci</span>
        ) : null}
      </header>

      <div className="connect-devices-list">
        {/* —— Withings —— */}
        {withingsConnectedCompact ? (
          <div className="connect-status-row">
            <p className="connect-status-line">
              <span className="connect-status-check" aria-hidden>✓</span>
              <span>Chytrá váha · připojeno</span>
            </p>
            <button
              type="button"
              className="connect-manage-link"
              onClick={() => setManageWithings(true)}
              aria-label="Spravovat chytrá váha"
            >
              Spravovat
            </button>
          </div>
        ) : withingsConnected && manageWithings ? (
          <div className="connect-manage-panel">
            <p className="connect-status-line">
              <span className="connect-status-check" aria-hidden>✓</span>
              <span>Chytrá váha · připojeno</span>
            </p>
            <p className="connect-manage-hint">
              Data a synchronizace jsou v sekci Tělesný vývoj níž. Tady jen znovu propojíš účet.
            </p>
            <div className="connect-manage-actions">
              <button type="button" className="connect-btn secondary" onClick={startWithings} disabled={!session?.access_token}>
                Znovu propojit Withings
              </button>
              <button type="button" className="connect-manage-link" onClick={() => setManageWithings(false)}>
                Zavřít
              </button>
            </div>
            {withingsMsg ? <p className="connect-error" role="alert">{withingsMsg}</p> : null}
          </div>
        ) : (
          <article className={`connect-card${wantsDevice(devices, 'scale') ? ' connect-card--interest' : ''}`}>
            <h3>Chytrá váha (Withings)</h3>
            <p>Withings pošle data do profilu. Plán se může upravit podle trendu, ne podle jednoho měření.</p>
            <p className="connect-status">Zatím nepřipojeno</p>
            <button type="button" className="connect-btn" onClick={startWithings} disabled={!session?.access_token}>
              Připojit Withings
            </button>
            {withingsMsg ? <p className="connect-error" role="alert">{withingsMsg}</p> : null}
          </article>
        )}

        {/* —— Apple Watch —— */}
        {appleConnectedCompact ? (
          <div className="connect-status-row">
            <p className="connect-status-line">
              <span className="connect-status-check" aria-hidden>✓</span>
              <span>
                Apple Watch · připojeno
                {lastSyncLabel ? ` · poslední sync ${lastSyncLabel}` : ''}
              </span>
            </p>
            <button
              type="button"
              className="connect-manage-link"
              onClick={openAppleManage}
              aria-label="Spravovat Apple Watch"
            >
              Spravovat
            </button>
          </div>
        ) : (
          <article className={`connect-card${wantsDevice(devices, 'watch') ? ' connect-card--interest' : ''}${activeApple && manageApple ? ' connect-card--manage' : ''}`}>
            {activeApple && manageApple ? (
              <div className="connect-manage-panel-head">
                <p className="connect-status-line">
                  <span className="connect-status-check" aria-hidden>✓</span>
                  <span>Apple Watch · připojeno</span>
                </p>
                <button type="button" className="connect-manage-link" onClick={closeAppleManage}>
                  Zavřít
                </button>
              </div>
            ) : (
              <>
                <h3>Chytré hodinky (Apple Watch)</h3>
                <p>Apple Watch přes Health Auto Export. Data jdou přes naše API do profilu.</p>
                <p className="connect-status">Zatím nepřipojeno</p>
              </>
            )}

            <div className="connect-apple-wizard">
              {watchStep === 1 && (
                <>
                  <p className="connect-step-label">
                    {activeApple ? 'Nový klíč / znovu nastavit' : 'Krok 1 z 3'}
                  </p>
                  {/* copy-check:whitelist:start */}
                  <p>
                    Pro automatický přenos z Apple Watch potřebuješ iOS aplikaci{' '}
                    <strong>Health Auto Export</strong> a její <strong>Premium</strong> (placené)
                    kvůli REST API. Bez Premium automatizace nefunguje — to je omezení té appky, ne Body &amp; Mind ON.
                  </p>
                  {/* copy-check:whitelist:end */}
                  <button type="button" className="connect-btn" onClick={() => setWatchStep(2)}>
                    {activeApple ? 'Vygenerovat nový klíč' : 'Rozumím, pokračovat'}
                  </button>
                  {activeApple ? (
                    <button type="button" className="connect-btn secondary" onClick={closeAppleManage}>
                      Zrušit
                    </button>
                  ) : null}
                </>
              )}

              {watchStep === 2 && (
                <>
                  <p className="connect-step-label">Krok 2 z 3</p>
                  <p>Vygenerujeme API klíč. Ukážeme ho jen jednou — hned si ho ulož do Health Auto Export.</p>
                  <button type="button" className="connect-btn" onClick={generateAppleKey} disabled={watchBusy || !session?.access_token}>
                    {watchBusy ? 'Generuji…' : 'Vygenerovat API klíč'}
                  </button>
                  <button
                    type="button"
                    className="connect-btn secondary"
                    onClick={() => (activeApple ? closeAppleManage() : setWatchStep(1))}
                    disabled={watchBusy}
                  >
                    Zpět
                  </button>
                </>
              )}

              {watchStep === 3 && (
                <>
                  <p className="connect-step-label">Krok 3 z 3</p>
                  <p>Nastavení automatizace v Health Auto Export:</p>
                  <ul className="connect-guide">
                    <li>Formát: <strong>JSON</strong></li>
                    <li>API verze: <strong>v2</strong></li>
                    <li>Seskupování: <strong>Hodina</strong></li>
                    <li>Interval: <strong>1 h</strong></li>
                  </ul>

                  <label className="connect-field-label">URL endpointu</label>
                  <div className="connect-copy-row">
                    <code>{endpoint}</code>
                    <button type="button" className="connect-btn secondary" onClick={() => copyText('url', endpoint)}>
                      {copied === 'url' ? 'Zkopírováno' : 'Kopírovat'}
                    </button>
                  </div>

                  {apiKeyOnce ? (
                    <>
                      <label className="connect-field-label">API klíč (jen teď)</label>
                      <div className="connect-copy-row">
                        <code>{apiKeyOnce}</code>
                        <button type="button" className="connect-btn secondary" onClick={() => copyText('key', apiKeyOnce)}>
                          {copied === 'key' ? 'Zkopírováno' : 'Kopírovat'}
                        </button>
                      </div>
                      <p className="connect-warn">Klíč znovu neuvidíš. Když ho ztratíš, vygeneruj nový.</p>
                    </>
                  ) : null}

                  <button type="button" className="connect-btn" onClick={closeAppleManage}>
                    Hotovo
                  </button>
                </>
              )}

              {watchError ? <p className="connect-error" role="alert">{watchError}</p> : null}
            </div>
          </article>
        )}
      </div>

      <style jsx>{`
        .connect-devices {
          margin: 0 0 20px;
          padding: 18px 18px 16px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.45);
        }
        .connect-devices--highlight {
          border-color: rgba(56, 189, 248, 0.55);
          box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.18);
        }
        .connect-devices-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .connect-devices-head h2 {
          margin: 0 0 6px;
          font-size: 1.15rem;
          color: #f8fafc;
        }
        .connect-devices-head p {
          margin: 0;
          font-size: 0.92rem;
          line-height: 1.45;
          color: #94a3b8;
        }
        .connect-devices-badge {
          flex-shrink: 0;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          color: #e0f2fe;
          background: rgba(14, 165, 233, 0.2);
          border: 1px solid rgba(56, 189, 248, 0.35);
        }
        .connect-devices-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .connect-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(34, 197, 94, 0.28);
          background: rgba(22, 101, 52, 0.12);
        }
        .connect-status-line {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          color: #e2e8f0;
          line-height: 1.35;
        }
        .connect-status-check {
          color: #86efac;
          font-weight: 700;
        }
        .connect-manage-link {
          flex-shrink: 0;
          background: none;
          border: none;
          padding: 4px 0;
          font-size: 0.82rem;
          font-weight: 600;
          color: #94a3b8;
          text-decoration: underline;
          text-underline-offset: 2px;
          cursor: pointer;
        }
        .connect-manage-link:hover {
          color: #e2e8f0;
        }
        .connect-manage-panel {
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(2, 6, 23, 0.35);
        }
        .connect-manage-hint {
          margin: 8px 0 10px;
          font-size: 0.85rem;
          line-height: 1.4;
          color: #94a3b8;
        }
        .connect-manage-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }
        .connect-manage-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .connect-card {
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(2, 6, 23, 0.35);
        }
        .connect-card--interest {
          border-color: rgba(56, 189, 248, 0.4);
        }
        .connect-card--manage {
          border-color: rgba(148, 163, 184, 0.28);
        }
        .connect-card h3 {
          margin: 0 0 6px;
          font-size: 1rem;
          color: #f1f5f9;
        }
        .connect-card > p {
          margin: 0 0 10px;
          font-size: 0.88rem;
          line-height: 1.4;
          color: #94a3b8;
        }
        .connect-status {
          margin: 0 0 10px;
          font-size: 0.85rem;
          color: #cbd5e1;
        }
        .connect-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 0 8px 8px 0;
          padding: 10px 14px;
          border-radius: 10px;
          border: none;
          background: #38bdf8;
          color: #0f172a;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .connect-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .connect-btn.secondary {
          background: transparent;
          color: #e2e8f0;
          border: 1px solid rgba(148, 163, 184, 0.35);
        }
        .connect-step-label {
          margin: 0 0 8px;
          font-size: 0.75rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #7dd3fc;
        }
        .connect-guide {
          margin: 0 0 12px;
          padding-left: 18px;
          color: #cbd5e1;
          font-size: 0.88rem;
          line-height: 1.5;
        }
        .connect-field-label {
          display: block;
          margin: 10px 0 6px;
          font-size: 0.8rem;
          color: #94a3b8;
        }
        .connect-copy-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 8px;
        }
        .connect-copy-row code {
          display: block;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.25);
          color: #e2e8f0;
          font-size: 0.78rem;
          word-break: break-all;
        }
        .connect-warn {
          margin: 0 0 10px;
          font-size: 0.82rem;
          color: #fcd34d;
        }
        .connect-error {
          margin: 8px 0 0;
          font-size: 0.85rem;
          color: #fca5a5;
        }
        .connect-apple-wizard > p {
          margin: 0 0 10px;
          font-size: 0.88rem;
          line-height: 1.4;
          color: #94a3b8;
        }
      `}</style>
    </section>
  );
}
