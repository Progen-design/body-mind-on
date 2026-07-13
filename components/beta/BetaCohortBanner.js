import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * Beta cohort banner — shown only to active beta participants.
 */
export default function BetaCohortBanner() {
  const [visible, setVisible] = useState(false);
  const [cohortName, setCohortName] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      try {
        const res = await fetch('/api/beta/my-status', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && json.is_beta_participant) {
          setVisible(true);
          setCohortName(json.cohort_name || 'START Beta');
        }
      } catch {
        /* ignore */
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="beta-cohort-banner"
      role="status"
      aria-label="Beta verze"
    >
      <p>
        <strong>Jsi součástí uzavřené beta verze START</strong>
        {' — '}
        {cohortName}. Funkce se mohou měnit; plán je obecné doporučení, ne zdravotní péče.
        Tvoje zpětná vazba nám pomůže produkt zlepšit.
      </p>
      <style jsx>{`
        .beta-cohort-banner {
          margin: 0 0 16px;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(251, 191, 36, 0.45);
          background: rgba(251, 191, 36, 0.1);
          color: #fde68a;
          font-size: 14px;
          line-height: 1.5;
        }
        .beta-cohort-banner strong {
          color: #fcd34d;
        }
      `}</style>
    </div>
  );
}
