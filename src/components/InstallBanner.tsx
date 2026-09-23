import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { CESTA_INSTALACE, naviguj } from '../routing';
import {
  KLIC_ZAVRENO,
  aktualniVyzva,
  beziZPlochy,
  jeZavreno,
  maZobrazitBanner,
  odebirejVyzvu,
  spotrebujVyzvu,
  urciPlatformu,
} from '../lib/instalace';

/**
 * „MĚJ BMON PO RUCE JAKO APLIKACI."
 *
 * Android s výzvou prohlížeče: „Nainstalovat" vyvolá systémovou výzvu.
 * Jinde (iOS, Android bez výzvy): „Jak na to" vede na návod /instalace
 * podle prohlížeče.
 * „Teď ne" banner schová na 30 dní (localStorage `bmon_install_dismissed`).
 *
 * Kdy se ukazuje, rozhoduje `maZobrazitBanner()` v lib/instalace.ts.
 */
interface Props {
  prihlasen: boolean;
}

function prectiZavreno(): boolean {
  try {
    return jeZavreno(window.localStorage.getItem(KLIC_ZAVRENO));
  } catch {
    // Soukromé okno nebo zakázané úložiště — banner radši ukázat.
    return false;
  }
}

export const InstallBanner: React.FC<Props> = ({ prihlasen }) => {
  const [maVyzvu, setMaVyzvu] = useState(() => aktualniVyzva() !== null);
  const [zavreno, setZavreno] = useState(prectiZavreno);
  const platforma = urciPlatformu(navigator.userAgent, navigator.maxTouchPoints);

  useEffect(() => odebirejVyzvu(() => setMaVyzvu(aktualniVyzva() !== null)), []);

  const zobrazit = maZobrazitBanner({
    prihlasen,
    platforma,
    standalone: beziZPlochy(),
    zavreno,
    maVyzvu,
  });
  if (!zobrazit) return null;

  const zavri = () => {
    try {
      window.localStorage.setItem(KLIC_ZAVRENO, String(Date.now()));
    } catch {
      // Bez úložiště se banner schová aspoň do obnovení stránky.
    }
    setZavreno(true);
  };

  // Android s výzvou prohlížeče nainstaluje rovnou, všude jinde vede tlačítko
  // na návod podle prohlížeče (/instalace).
  const instalujRovnou = platforma === 'android' && maVyzvu;

  const pridej = async () => {
    const vyzva = aktualniVyzva();
    if (!instalujRovnou || !vyzva) {
      naviguj(CESTA_INSTALACE);
      return;
    }
    spotrebujVyzvu();
    await vyzva.prompt();
    const { outcome } = await vyzva.userChoice;
    // Odmítnutí systémové výzvy = „Teď ne". Přijetí banner schová samo —
    // výzva je spotřebovaná a appka pak běží z plochy.
    if (outcome === 'dismissed') zavri();
  };

  return (
    <div
      role="region"
      aria-label="Přidat aplikaci na plochu"
      className="p-3.5 rounded-2xl bg-povrch border border-cyan-500/30 flex items-center gap-3"
    >
      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-akcent-cyan to-akcent-lime text-na-akcentu flex items-center justify-center shrink-0">
        <Smartphone className="w-5 h-5" />
      </span>
      <p className="flex-1 min-w-0 text-sm font-semibold text-slate-100">Měj BMON po ruce jako aplikaci.</p>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={zavri}
          className="min-h-10 px-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
        >
          Teď ne
        </button>
        <button
          type="button"
          onClick={pridej}
          className="min-h-10 px-3 rounded-xl text-xs font-bold text-slate-950 bg-akcent-cyan"
        >
          {instalujRovnou ? 'Nainstalovat' : 'Jak na to'}
        </button>
      </div>
    </div>
  );
};
