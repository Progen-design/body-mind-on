import { BM_ON_DESIGN } from '../../lib/designTokens';
import { buildHealthDailyInsight } from '../../lib/health/insights';

export default function HealthInsightsPanel({
  recoveryRows = [],
  watchRows = [],
  workoutRows = [],
}) {
  const insight = buildHealthDailyInsight({ recoveryRows, watchRows, workoutRows });

  if (!insight.summary && insight.recommendations.length === 0 && !insight.alert) {
    return null;
  }

  return (
    <section className="health-insights" aria-labelledby="health-insights-heading">
      <h3 id="health-insights-heading" className="health-insights-title">
        Co z toho vyplývá
      </h3>

      {insight.alert ? (
        <p className="health-insights-alert" role="status">
          {insight.alert}
        </p>
      ) : null}

      {insight.summary ? <p className="health-insights-summary">{insight.summary}</p> : null}

      {insight.recommendations.length > 0 ? (
        <ul className="health-insights-list">
          {insight.recommendations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <p className="health-insights-disclaimer">
        Orientační doporučení podle tvých dat — není zdravotní diagnostika ani náhrada lékaře.
      </p>

      <style jsx>{`
        .health-insights {
          margin: 0 0 24px;
          padding: 18px 20px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(14, 165, 233, 0.08));
          border: 1px solid rgba(124, 58, 237, 0.35);
        }
        .health-insights-title {
          margin: 0 0 12px;
          font-size: 1.05rem;
          font-weight: 700;
          color: ${BM_ON_DESIGN.colors.text};
        }
        .health-insights-alert {
          margin: 0 0 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(251, 113, 133, 0.12);
          border: 1px solid rgba(251, 113, 133, 0.35);
          color: #fecdd3;
          font-size: 0.88rem;
          line-height: 1.45;
        }
        .health-insights-summary {
          margin: 0 0 12px;
          font-size: 0.95rem;
          line-height: 1.5;
          color: ${BM_ON_DESIGN.colors.text};
          font-weight: 600;
        }
        .health-insights-list {
          margin: 0;
          padding-left: 1.2rem;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .health-insights-list li {
          font-size: 0.88rem;
          line-height: 1.45;
          color: ${BM_ON_DESIGN.colors.textMuted};
        }
        .health-insights-disclaimer {
          margin: 14px 0 0;
          font-size: 0.78rem;
          line-height: 1.4;
          color: ${BM_ON_DESIGN.colors.textDim};
        }
      `}</style>
    </section>
  );
}
