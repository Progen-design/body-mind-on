import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AppleWatchSection from '../../components/health/AppleWatchSection';
import WithingsScaleSection from '../../components/health/WithingsScaleSection';
import { supabase } from '../../lib/supabaseClient';
import { useHealthData } from '../../hooks/useHealthData';

export default function HealthDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data?.session || null);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthLoading(false);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/login?redirect=/dashboard/zdravi');
    }
  }, [authLoading, session, router]);

  const { data, loading, error, reload } = useHealthData(session?.access_token, {
    days: 30,
    workoutLimit: 20,
  });

  return (
    <>
      <Header />
      <main className="health-page app-page">
        <div className="health-page-inner">
          <div className="health-page-top">
            <Link href="/profil" className="health-back-link">
              <FiArrowLeft aria-hidden />
              Zpět do profilu
            </Link>
            <button type="button" className="health-refresh-btn" onClick={reload} disabled={loading || !session}>
              <FiRefreshCw aria-hidden className={loading ? 'health-spin' : ''} />
              {loading ? 'Načítám…' : 'Obnovit'}
            </button>
          </div>

          <header className="health-page-header">
            <h1 className="health-page-title">Zdraví a regenerace</h1>
            <p className="health-page-lead">
              Apple Watch a Withings jsou zobrazeny odděleně — každý zdroj má vlastní sekci a vlastní grafy.
            </p>
          </header>

          {authLoading && <p className="health-loading">Ověřuji přihlášení…</p>}
          {!authLoading && error && (
            <div className="health-error" role="alert">
              <p>{error}</p>
            </div>
          )}
          {!authLoading && !error && loading && !data.connection && (
            <p className="health-loading">Načítám zdravotní data…</p>
          )}

          {!authLoading && session && (
            <>
              <AppleWatchSection
                connection={data.connection}
                watchRows={data.watch?.rows || []}
                recoveryRows={data.recovery?.rows || []}
                workoutRows={data.workouts?.rows || []}
                metricRows={data.metrics?.rows || []}
              />

              <div className="health-section-divider" role="separator" aria-hidden />

              <WithingsScaleSection scaleRows={data.scale?.rows || []} />
            </>
          )}
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .health-page {
          min-height: 100vh;
          background: var(--bmon-bg);
          color: var(--bmon-text);
          padding: 24px 16px 64px;
        }
        .health-page-inner {
          max-width: 960px;
          margin: 0 auto;
        }
        .health-page-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
        }
        .health-back-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--bmon-sky);
          text-decoration: none;
          font-size: 0.95rem;
        }
        .health-back-link:hover {
          color: var(--bmon-lavender);
        }
        .health-refresh-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: var(--bmon-radius-button);
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(255, 255, 255, 0.06);
          color: var(--bmon-text-muted);
          cursor: pointer;
        }
        .health-refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .health-page-header {
          margin-bottom: 28px;
        }
        .health-page-title {
          margin: 0 0 8px;
          font-size: 1.75rem;
          font-weight: 700;
        }
        .health-page-lead {
          margin: 0;
          color: var(--bmon-text-muted);
          line-height: 1.5;
        }
        .health-loading,
        .health-error {
          padding: 16px;
          border-radius: var(--bmon-radius-card);
          background: var(--profil-card-bg);
          border: 1px solid var(--profil-card-border);
        }
        .health-error {
          border-color: rgba(251, 113, 133, 0.45);
          color: #fecdd3;
        }
        .health-section-divider {
          height: 2px;
          margin: 40px 0;
          background: linear-gradient(90deg, rgba(14, 165, 233, 0.5), rgba(167, 139, 250, 0.35), rgba(34, 211, 238, 0.2));
          border-radius: 999px;
        }
        .health-spin {
          animation: health-spin 0.9s linear infinite;
        }
        @keyframes health-spin {
          to { transform: rotate(360deg); }
        }
        :global(.health-section) {
          background: var(--profil-card-bg);
          border: 1px solid var(--profil-card-border);
          border-radius: var(--bmon-radius-card);
          padding: 20px;
          box-shadow: var(--bmon-shadow-card);
        }
        :global(.health-section--watch) {
          border-color: rgba(14, 165, 233, 0.35);
        }
        :global(.health-section--withings) {
          border-color: rgba(56, 189, 248, 0.45);
          background: linear-gradient(180deg, rgba(14, 165, 233, 0.06) 0%, var(--profil-card-bg) 120px);
        }
        :global(.health-section-header) {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 18px;
        }
        :global(.health-section-emoji) {
          font-size: 1.75rem;
          line-height: 1;
        }
        :global(.health-section-title) {
          margin: 0;
          font-size: 1.35rem;
        }
        :global(.health-section-subtitle) {
          margin: 4px 0 0;
          color: var(--bmon-text-muted);
          font-size: 0.92rem;
        }
        :global(.health-banner) {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 14px 16px;
          border-radius: 12px;
          margin-bottom: 18px;
        }
        :global(.health-banner--ok) {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.35);
        }
        :global(.health-banner--warning) {
          background: rgba(251, 191, 36, 0.12);
          border: 1px solid rgba(251, 191, 36, 0.4);
        }
        :global(.health-banner--none) {
          background: rgba(148, 163, 184, 0.1);
          border: 1px solid rgba(148, 163, 184, 0.25);
        }
        :global(.health-banner-icon) {
          flex-shrink: 0;
          margin-top: 2px;
          font-size: 1.2rem;
        }
        :global(.health-banner--ok .health-banner-icon) { color: #22c55e; }
        :global(.health-banner--warning .health-banner-icon) { color: #fbbf24; }
        :global(.health-banner--none .health-banner-icon) { color: #94a3b8; }
        :global(.health-banner-title) {
          margin: 0 0 4px;
          font-weight: 600;
        }
        :global(.health-banner-text) {
          margin: 0;
          color: var(--bmon-text-muted);
          font-size: 0.92rem;
        }
        :global(.health-recovery-card) {
          padding: 18px;
          border-radius: 14px;
          margin-bottom: 20px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(148, 163, 184, 0.2);
        }
        :global(.health-recovery-card--green) { border-color: rgba(34, 197, 94, 0.45); }
        :global(.health-recovery-card--orange) { border-color: rgba(251, 191, 36, 0.45); }
        :global(.health-recovery-card--red) { border-color: rgba(251, 113, 133, 0.45); }
        :global(.health-recovery-title) {
          margin: 0 0 10px;
          font-size: 1.1rem;
        }
        :global(.health-recovery-score-row) {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }
        :global(.health-recovery-score) {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1;
        }
        :global(.health-recovery-score-max) {
          color: var(--bmon-text-muted);
        }
        :global(.health-recovery-band) {
          margin: 8px 0 0;
          font-weight: 600;
        }
        :global(.health-recovery-band--green) { color: #22c55e; }
        :global(.health-recovery-band--orange) { color: #fbbf24; }
        :global(.health-recovery-band--red) { color: #fb7185; }
        :global(.health-recovery-incomplete-label) {
          margin: 0;
          font-weight: 600;
        }
        :global(.health-recovery-status-reason) {
          margin: 6px 0 0;
          color: var(--bmon-text-muted);
        }
        :global(.health-recovery-metrics) {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px 16px;
          margin: 16px 0 0;
        }
        :global(.health-recovery-metrics dt) {
          margin: 0;
          font-size: 0.8rem;
          color: var(--bmon-text-muted);
        }
        :global(.health-recovery-metrics dd) {
          margin: 2px 0 0;
          font-weight: 600;
        }
        :global(.health-recovery-disclaimer) {
          margin: 14px 0 0;
          font-size: 0.82rem;
          color: var(--bmon-text-muted);
        }
        :global(.health-charts-grid) {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }
        :global(.health-chart) {
          padding: 12px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.18);
          border: 1px solid rgba(148, 163, 184, 0.15);
        }
        :global(.health-chart-title) {
          margin: 0 0 8px;
          font-size: 0.95rem;
        }
        :global(.health-chart-svg-wrap) {
          width: 100%;
          height: 180px;
        }
        :global(.health-chart-svg) {
          width: 100%;
          height: 100%;
          display: block;
        }
        :global(.health-chart-legend) {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 8px 0 0;
          font-size: 0.78rem;
          color: var(--bmon-text-muted);
        }
        :global(.health-chart-legend-line) {
          width: 18px;
          height: 3px;
          border-radius: 2px;
        }
        :global(.health-chart-legend-line--baseline) {
          background: transparent;
          border-top: 2px dashed #64748b;
        }
        :global(.health-chart-empty),
        :global(.health-empty-text) {
          color: var(--bmon-text-muted);
          margin: 0;
        }
        :global(.health-subsection-title) {
          margin: 0 0 12px;
          font-size: 1rem;
        }
        :global(.health-table-wrap) {
          overflow-x: auto;
        }
        :global(.health-table) {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        :global(.health-table th),
        :global(.health-table td) {
          padding: 10px 8px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
          text-align: left;
        }
        :global(.health-table th) {
          color: var(--bmon-text-muted);
          font-weight: 500;
        }
        :global(.health-withings-latest) {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        :global(.health-withings-stat) {
          padding: 14px;
          border-radius: 12px;
          background: rgba(14, 165, 233, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.25);
        }
        :global(.health-withings-stat-label) {
          display: block;
          font-size: 0.82rem;
          color: var(--bmon-text-muted);
        }
        :global(.health-withings-stat-value) {
          display: block;
          margin-top: 4px;
          font-size: 1.35rem;
          font-weight: 700;
        }
        :global(.health-withings-stat-meta) {
          display: block;
          margin-top: 4px;
          font-size: 0.8rem;
          color: var(--bmon-text-muted);
        }
      `}</style>
    </>
  );
}
