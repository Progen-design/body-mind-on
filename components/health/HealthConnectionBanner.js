import { FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';

export default function HealthConnectionBanner({ banner, active, meta }) {
  if (!banner) return null;

  const level = banner.level || 'none';
  const isOk = level === 'ok';
  const isNone = level === 'none';

  const Icon = isOk ? FiCheckCircle : isNone ? FiInfo : FiAlertTriangle;
  const className = `health-banner health-banner--${level}`;

  return (
    <div className={className} role={isOk ? 'status' : 'alert'}>
      <Icon className="health-banner-icon" aria-hidden />
      <div className="health-banner-body">
        {isOk ? (
          <>
            <p className="health-banner-title">Apple Watch synchronizace v pořádku</p>
            {active?.last_sync_at && (
              <p className="health-banner-text">
                Poslední sync: {meta?.last_sync_relative || 'nedávno'}
                {active?.device_label ? ` · ${active.device_label}` : ''}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="health-banner-title">
              {isNone ? 'Apple Watch není propojený' : 'Pozor na synchronizaci'}
            </p>
            {banner.message && <p className="health-banner-text">{banner.message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
