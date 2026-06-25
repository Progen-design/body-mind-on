export default function ProgramContinuationPanel({ daysUntilTrialEnd, isExpired }) {
  const days = Number(daysUntilTrialEnd);
  const validDays = Number.isFinite(days) ? days : null;
  const headline = isExpired
    ? 'START přístup vypršel'
    : `START končí za ${validDays === 0 ? 'dnes' : validDays === 1 ? '1 den' : `${validDays} dní`}`;
  const subline = isExpired
    ? 'Plán i historii máš dál dostupné. Pro nové týdny, plné funkce a kontinuální progres stačí navázat předplatným.'
    : 'Navazující přístup aktivuj včas, ať nepřijdeš o plynulý progres, plánování dalších týdnů a plnou práci s návyky.';

  return (
    <section className={`program-continuation ${isExpired ? 'program-continuation--expired' : ''}`}>
      <div className="program-continuation__header">
        <div className="program-continuation__badge">{isExpired ? 'Přístup vypršel' : 'Pokračování programu'}</div>
        <h3 className="program-continuation__title">{headline}</h3>
        <p className="program-continuation__subtitle">{subline}</p>
      </div>

      <div className="program-continuation__meta">
        <div className="program-continuation__meta-card">
          <strong>{isExpired ? 'Co zůstává' : 'Po přechodu získáš'}</strong>
          <span>Historie výsledků, přehled tréninků, nové týdenní plány a plnou kontinuitu.</span>
        </div>
        <div className="program-continuation__meta-card">
          <strong>{isExpired ? 'Proč pokračovat' : 'Proč řešit už teď'}</strong>
          <span>Bez pauzy navážeš na adaptaci těla i návyků, bez ztráty tempa.</span>
        </div>
      </div>

      <div className="program-continuation__actions">
        <a href="#program-variants" className="program-continuation__cta program-continuation__cta--primary">Vybrat další krok</a>
        <a href="/on-club" className="program-continuation__cta">Vstoupit do ON CLUBU</a>
      </div>

      <style jsx>{`
        .program-continuation {
          width: 100%;
          max-width: min(1180px, 100%);
          margin: 10px auto 14px;
          padding: clamp(1rem, 3vw, 1.25rem);
          border-radius: 18px;
          border: 1px solid rgba(59, 130, 246, 0.35);
          background: radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.24), transparent 48%),
            linear-gradient(135deg, rgba(10, 15, 30, 0.95), rgba(18, 11, 38, 0.95));
          box-shadow: 0 14px 34px rgba(2, 6, 23, 0.45);
          box-sizing: border-box;
        }
        .program-continuation--expired {
          border-color: rgba(244, 63, 94, 0.45);
          background: radial-gradient(circle at 0% 0%, rgba(244, 63, 94, 0.22), transparent 52%),
            linear-gradient(135deg, rgba(22, 10, 20, 0.95), rgba(40, 16, 34, 0.95));
        }
        .program-continuation__header {
          margin-bottom: 14px;
        }
        .program-continuation__badge {
          display: inline-block;
          margin-bottom: 10px;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #bfdbfe;
          background: rgba(30, 64, 175, 0.35);
        }
        .program-continuation--expired .program-continuation__badge {
          color: #fecdd3;
          background: rgba(159, 18, 57, 0.35);
        }
        .program-continuation__title {
          margin: 0 0 8px;
          color: #f8fafc;
          font-size: 24px;
          line-height: 1.2;
          letter-spacing: -0.02em;
        }
        .program-continuation__subtitle {
          margin: 0;
          color: #cbd5e1;
          font-size: 14px;
          line-height: 1.65;
          max-width: 840px;
        }
        .program-continuation__meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin: 14px 0 18px;
        }
        .program-continuation__meta-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.45);
        }
        .program-continuation__meta-card strong {
          color: #e2e8f0;
          font-size: 13px;
        }
        .program-continuation__meta-card span {
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.55;
        }
        .program-continuation__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .program-continuation__cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.68);
          color: #e2e8f0;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .program-continuation__cta:hover {
          transform: translateY(-1px);
          border-color: rgba(196, 181, 253, 0.8);
        }
        .program-continuation__cta--primary {
          border-color: rgba(96, 165, 250, 0.7);
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: #fff;
        }
        @media (max-width: 900px) {
          .program-continuation__meta {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

