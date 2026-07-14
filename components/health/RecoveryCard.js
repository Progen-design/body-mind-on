import { BM_ON_DESIGN } from '../../lib/designTokens';
import {
  formatRecoveryStatusLabel,
  getRecoveryBandInfo,
} from '../../lib/health/formatters';

const RECOVERY_EXPLAIN =
  'Skóre regenerace (0–100) odhaduje, jak jsi zotavený, z HRV a klidového tepu oproti tvému 7dennímu průměru. Vyšší = odpočatější. Není to zdravotní diagnostika.';

function getRecoveryBandTip(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  if (n >= 75) return 'Tělo je zotavené — můžeš zabrat.';
  if (n >= 50) return 'Částečná únava — zvaž lehčí trénink.';
  return 'Známky zátěže — dej přednost regeneraci a spánku.';
}

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
  const bandTip = scoreOk && latest.recovery_score != null ? getRecoveryBandTip(latest.recovery_score) : null;

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
          <p className="health-recovery-explain">{RECOVERY_EXPLAIN}</p>
          {bandTip && <p className="health-recovery-tip">{bandTip}</p>}
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

      {!scoreOk && (
        <p className="health-recovery-disclaimer">
          Orientační ukazatel tréninkové zátěže — není zdravotní diagnostika.
        </p>
      )}

      <style jsx>{`
        .health-recovery-explain,
        .health-recovery-tip {
          margin: 10px 0 0;
          font-size: 0.82rem;
          line-height: 1.45;
          color: ${BM_ON_DESIGN.colors.textMuted};
        }
        .health-recovery-tip {
          margin-top: 6px;
          color: ${BM_ON_DESIGN.colors.textDim};
        }
      `}</style>
    </div>
  );
}
