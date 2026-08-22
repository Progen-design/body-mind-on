import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Sentry, spustSentry } from './lib/sentry';

spustSentry();

/**
 * Pad komponenty jinak skonci bilou obrazovkou a uzivatel netusi, co se stalo —
 * presne to se stalo pri prazdnem planu. Tady dostane vysvetleni a cestu ven,
 * a chyba odejde do Sentry.
 */
function Havarie() {
  return (
    <div className="min-h-screen bg-[#08090d] flex items-center justify-center p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="max-w-sm w-full rounded-3xl bg-[#0c1017] border border-rose-500/30 p-6 text-center">
        <h1 className="text-xl font-bold text-white flex items-center justify-center gap-1.5 mb-3">
          <span>Body &amp; Mind</span>
          <span className="text-[#39ff14] font-extrabold">ON</span>
        </h1>
        <p className="text-sm text-slate-300 mb-1">Něco se pokazilo.</p>
        <p className="text-xs text-slate-500 mb-4">
          Chybu jsme zaznamenali a podíváme se na ni. Zkus stránku načíst znovu.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2.5 rounded-2xl bg-[#39ff14] text-[#08090d] font-bold text-sm"
        >
          Načíst znovu
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<Havarie />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
