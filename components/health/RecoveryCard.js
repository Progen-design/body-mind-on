import {
  formatRecoveryStatusLabel,
  getRecoveryBandInfo,
} from '../../lib/health/formatters';

export default function RecoveryCard({ latest }) {
  if (!latest) {
    return (
      <div className="health-recovery-card health-recovery-card--empty">
        <h3 className="health-recovery-title">Regenerace</h3>
        <p className="health-recovery-empty">Zatím nemáme dostatek dat z Apple Watch pro výpočet regenerace.</p>
        <p className="health-recovery-disclaimer">
          Orientační ukazatel tréninkové zátěže — není zdravotní diagnostika.
        </p>
      </div>
    );
  }

  const status = latest.recovery_status || null;
  const scoreOk = status === 'ok';
  const bandInfo = scoreOk ? getRecoveryBandInfo(latest.recovery_score) : { band: null, label: null, color: null };
  const statusLabel = !scoreOk ? formatRecoveryStatusLabel(status) : null;

  return (
    <div className={`health-recovery-card health-recovery-card--${bandInfo.color || 'neutral'}`}>
      <h3 className="health-recovery-title">Regenerace</h3>

      {scoreOk && latest.recovery_score != null ? (
        <>
          <div className="health-recovery-score-row">
            <span className="health-recovery-score">{Math.round(Number(latest.recovery_score))}</span>
            <span className="health-recovery-score-max">/ 100</span>
          </div>
          {bandInfo.label && (
            <p className={`health-recovery-band health-recovery-band--${bandInfo.color}`}>{bandInfo.label}</p>
          )}
        </>
      ) : (
        <div className="health-recovery-incomplete">
          <p className="health-recovery-incomplete-label">Skóre nelze zobrazit</p>
          {statusLabel && <p className="health-recovery-status-reason">{statusLabel}</p>}
        </div>
      )}

      <dl className="health-recovery-metrics">
        {latest.hrv_ms != null && (
          <>
            <dt>HRV</dt>
            <dd>{Number(latest.hrv_ms).toFixed(1).replace('.', ',')} ms</dd>
          </>
        )}
        {latest.hrv_baseline7 != null && (
          <>
            <dt>Baseline HRV (7 dní)</dt>
            <dd>{Number(latest.hrv_baseline7).toFixed(1).replace('.', ',')} ms</dd>
          </>
        )}
        {latest.resting_hr != null && (
          <>
            <dt>Klidový tep</dt>
            <dd>{Math.round(Number(latest.resting_hr))} bpm</dd>
          </>
        )}
        {latest.rhr_baseline7 != null && (
          <>
            <dt>Baseline klidový tep</dt>
            <dd>{Math.round(Number(latest.rhr_baseline7))} bpm</dd>
          </>
        )}
        {latest.sleep_asleep_min != null && (
          <>
            <dt>Spánek</dt>
            <dd>{Math.round(Number(latest.sleep_asleep_min))} min</dd>
          </>
        )}
      </dl>

      <p className="health-recovery-disclaimer">
        Orientační ukazatel tréninkové zátěže — není zdravotní diagnostika.
      </p>
    </div>
  );
}
