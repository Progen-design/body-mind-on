import Link from 'next/link';
import { FiActivity, FiChevronRight } from 'react-icons/fi';

export default function HealthProfileEntry() {
  return (
    <div className="health-profile-entry">
      <Link href="/dashboard/zdravi" className="health-profile-entry-link">
        <span className="health-profile-entry-icon" aria-hidden>
          <FiActivity />
        </span>
        <span className="health-profile-entry-copy">
          <span className="health-profile-entry-title">Zdraví a regenerace</span>
          <span className="health-profile-entry-text">
            Apple Watch (aktivita, HRV, tréninky) a Withings (váha) — každý zdroj zvlášť, jako u váhy v profilu.
          </span>
        </span>
        <FiChevronRight className="health-profile-entry-chevron" aria-hidden />
      </Link>

      <style jsx>{`
        .health-profile-entry {
          margin-bottom: 16px;
        }
        .health-profile-entry-link {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          border-radius: var(--bmon-radius-card);
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.14) 0%, rgba(167, 139, 250, 0.12) 100%);
          border: 1px solid rgba(14, 165, 233, 0.35);
          color: var(--bmon-text);
          text-decoration: none;
          box-shadow: var(--bmon-shadow-card);
          transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .health-profile-entry-link:hover {
          border-color: rgba(167, 139, 250, 0.55);
          transform: translateY(-1px);
        }
        .health-profile-entry-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(14, 165, 233, 0.18);
          color: var(--bmon-sky);
          font-size: 1.25rem;
          flex-shrink: 0;
        }
        .health-profile-entry-copy {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 0;
        }
        .health-profile-entry-title {
          font-weight: 700;
          font-size: 1.05rem;
        }
        .health-profile-entry-text {
          color: var(--bmon-text-muted);
          font-size: 0.9rem;
          line-height: 1.4;
        }
        .health-profile-entry-chevron {
          flex-shrink: 0;
          color: var(--bmon-text-muted);
          font-size: 1.1rem;
        }
      `}</style>
    </div>
  );
}
