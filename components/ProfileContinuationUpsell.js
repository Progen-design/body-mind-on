import Link from 'next/link';

/**
 * Kompaktní CTA pro pokračování po STARTU — nízko v profilu, ne jako ceník.
 */
export default function ProfileContinuationUpsell({
  isTrialExpired = false,
  daysUntilTrialEnd = null,
}) {
  const days = Number(daysUntilTrialEnd);
  const nearExpiry = Number.isFinite(days) && days >= 0 && days <= 5;
  const showUrgency = Boolean(isTrialExpired) || nearExpiry;

  return (
    <aside
      id="profile-continuation-upsell"
      className={`profile-continuation-upsell ${showUrgency ? 'profile-continuation-upsell--urgent' : ''}`}
      aria-labelledby="profile-continuation-upsell-title"
    >
      {showUrgency ? (
        <p className="profile-continuation-upsell-urgency" role="status">
          {isTrialExpired
            ? 'START přístup vypršel — pro nové týdny a plné funkce naváž ON CLUB.'
            : `START končí za ${days === 0 ? 'dnes' : days === 1 ? '1 den' : `${days} dní`} — aktivuj navazující přístup včas.`}
        </p>
      ) : null}
      <h3 id="profile-continuation-upsell-title" className="profile-continuation-upsell-title">
        Chceš pokračovat dál?
      </h3>
      <p className="profile-continuation-upsell-text">
        START ti ukáže první plán. Pokud chceš komunitu, výzvy a dlouhodobé vedení, můžeš navázat v ON CLUBU.
      </p>
      <Link href="/on-club" className="profile-continuation-upsell-cta">
        Zobrazit možnosti pokračování
      </Link>

      <style jsx>{`
        .profile-continuation-upsell {
          width: 100%;
          max-width: min(1180px, 100%);
          margin: 8px auto 24px;
          padding: 16px 18px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.55);
          box-sizing: border-box;
        }
        .profile-continuation-upsell--urgent {
          border-color: rgba(96, 165, 250, 0.4);
          background: rgba(30, 58, 138, 0.2);
        }
        .profile-continuation-upsell-urgency {
          margin: 0 0 10px;
          font-size: 13px;
          line-height: 1.5;
          color: #bfdbfe;
        }
        .profile-continuation-upsell-title {
          margin: 0 0 6px;
          font-size: 17px;
          font-weight: 700;
          color: #f1f5f9;
          line-height: 1.3;
        }
        .profile-continuation-upsell-text {
          margin: 0 0 12px;
          font-size: 14px;
          line-height: 1.55;
          color: #94a3b8;
          max-width: 720px;
        }
        .profile-continuation-upsell-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 10px;
          border: 1px solid rgba(167, 139, 250, 0.55);
          background: rgba(124, 58, 237, 0.22);
          color: #e9d5ff;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .profile-continuation-upsell-cta:hover {
          background: rgba(124, 58, 237, 0.35);
          border-color: rgba(196, 181, 253, 0.75);
        }
      `}</style>
    </aside>
  );
}
