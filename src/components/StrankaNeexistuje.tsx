import React from 'react';
import { naviguj } from '../routing';

/**
 * 404 pro neplatnou cestu.
 *
 * Driv vercel.json prepisoval kazdou cestu mimo /api/ na index.html a SPA
 * cestu nikde nekontrolovala — app.bodyandmindon.cz tak vracel 200 a
 * prihlasenou aplikaci i na /gdpr nebo cemkoli neexistujicim. App.tsx ted
 * pred vykreslenim overi jePlatnaCesta() a na neznamou cestu ukaze tohle.
 */
export function StrankaNeexistuje() {
  return (
    <div className="min-h-screen bg-pozadi flex items-center justify-center p-4">
      <div className="max-w-sm w-full rounded-3xl bg-povrch border border-slate-800 p-6 text-center">
        <h1 className="text-xl font-bold text-white mb-2">Stránka neexistuje</h1>
        <p className="text-sm text-slate-400 mb-4">Tahle adresa v aplikaci není.</p>
        <button
          type="button"
          onClick={() => naviguj('/')}
          className="px-4 py-2.5 rounded-2xl bg-akcent-lime text-na-akcentu font-bold text-sm"
        >
          Zpět na úvod
        </button>
      </div>
    </div>
  );
}
