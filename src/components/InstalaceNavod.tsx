import React, { useEffect, useState } from 'react';
import {
  Share,
  SquarePlus,
  CheckCircle2,
  Ellipsis,
  EllipsisVertical,
  Download,
  Smartphone,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { naviguj } from '../routing';
import {
  KROKY_ANDROID,
  KROKY_IOS,
  POZNAMKY_IOS,
  URL_NAVODU,
  aktualniVyzva,
  beziZPlochy,
  odebirejVyzvu,
  osTohotoZarizeni,
  spotrebujVyzvu,
  variantaNavodu,
} from '../lib/instalace';

/**
 * NÁVOD „PŘIDAT NA PLOCHU" — trvale dostupný, ne jen jednorázový banner.
 *
 * Varianty (vybírá `variantaNavodu()` v lib/instalace.ts):
 * - standalone: hotovo, appka už běží z plochy,
 * - iOS: čtyři kroky přes menu vedle adresy → Sdílet (iOS 26), texty v lib/instalace.ts,
 * - Android: tlačítko „Nainstalovat" (když Chrome poslal výzvu), jinak kroky přes ⋮,
 * - desktop: QR kód na tuhle stránku, ať se otevře v telefonu.
 *
 * QR se kreslí lokálně z balíčku `qrcode` (žádný cizí obrázkový endpoint)
 * a načítá se až na počítači — telefon ho nepotřebuje.
 */
const InstalaceNavod: React.FC = () => {
  const varianta = variantaNavodu(osTohotoZarizeni(), beziZPlochy());

  if (varianta === 'standalone') {
    return (
      <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 flex items-start gap-3">
        <CheckCircle2 className="w-6 h-6 text-akcent-lime shrink-0" />
        <p className="text-sm font-semibold text-slate-100">Máš hotovo — BMON už běží jako aplikace.</p>
      </div>
    );
  }

  if (varianta === 'ios') return <NavodIos />;
  if (varianta === 'android') return <NavodAndroid />;
  return <NavodDesktop />;
};

/**
 * Jeden krok návodu. NESMÍ VYPADAT JAKO TLAČÍTKO — dřív to byly karty
 * s rámečkem a lidé na ně klepali, místo aby hledali menu v Safari. Teď je
 * to řádek: číslo, ikona, text, mezi kroky jen tenká linka. Žádný hover,
 * žádný kurzor, žádné pozadí.
 */
const Krok: React.FC<{ cislo: number; ikona: React.ReactNode; children: React.ReactNode }> = ({ cislo, ikona, children }) => (
  <li className="flex items-center gap-3 py-3 border-b border-slate-800/70 last:border-b-0">
    <span className="w-5 text-sm font-bold text-slate-500 tabular-nums shrink-0" aria-hidden="true">
      {cislo}.
    </span>
    <span className="flex items-center gap-1 text-akcent-cyan shrink-0" aria-hidden="true">
      {ikona}
    </span>
    <span className="text-sm text-slate-200 leading-snug">{children}</span>
  </li>
);

/** Řádek nad kroky — ať je jasné, že tady se nic neklepe. */
const UvodKroku: React.FC<{ kde: string }> = ({ kde }) => (
  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
    Postup v {kde} (nic tady neklikáš):
  </p>
);

const IKONY_IOS = [
  <>
    <Ellipsis className="w-5 h-5" />
    <Share className="w-3.5 h-3.5 opacity-70" />
  </>,
  <Share className="w-5 h-5" />,
  <SquarePlus className="w-5 h-5" />,
  <CheckCircle2 className="w-5 h-5" />,
];

const NavodIos: React.FC = () => (
  <div className="space-y-3">
    <UvodKroku kde="Safari" />
    <ol>
      {KROKY_IOS.map((text, i) => (
        <Krok key={text} cislo={i + 1} ikona={IKONY_IOS[i]}>{text}</Krok>
      ))}
    </ol>
    <div className="space-y-2 pt-1">
      {POZNAMKY_IOS.map((poznamka) => (
        <p key={poznamka} className="flex items-start gap-2 text-xs text-slate-400">
          <Info className="w-4 h-4 shrink-0 text-amber-300" />
          <span>{poznamka}</span>
        </p>
      ))}
    </div>
  </div>
);

const NavodAndroid: React.FC = () => {
  const [maVyzvu, setMaVyzvu] = useState(() => aktualniVyzva() !== null);
  useEffect(() => odebirejVyzvu(() => setMaVyzvu(aktualniVyzva() !== null)), []);

  const nainstaluj = async () => {
    const vyzva = aktualniVyzva();
    if (!vyzva) return;
    spotrebujVyzvu();
    await vyzva.prompt();
  };

  if (maVyzvu) {
    return (
      <button
        type="button"
        onClick={nainstaluj}
        className="w-full min-h-14 rounded-2xl text-base font-bold text-slate-950 bg-akcent-cyan inline-flex items-center justify-center gap-2.5 shadow-[0_8px_24px_rgba(0,242,254,0.3)]"
      >
        <Download className="w-5 h-5" />
        <span>Nainstalovat</span>
      </button>
    );
  }

  const ikony = [<EllipsisVertical className="w-5 h-5" />, <CheckCircle2 className="w-5 h-5" />];
  return (
    <div className="space-y-3">
      <UvodKroku kde="Chromu" />
      <ol>
        {KROKY_ANDROID.map((text, i) => (
          <Krok key={text} cislo={i + 1} ikona={ikony[i]}>{text}</Krok>
        ))}
      </ol>
    </div>
  );
};

/** QR z balíčku `qrcode` jako jedna SVG cesta — žádné innerHTML, žádný cizí server. */
function useQrCesta(text: string): { velikost: number; d: string } | null {
  const [qr, setQr] = useState<{ velikost: number; d: string } | null>(null);
  useEffect(() => {
    let zruseno = false;
    import('qrcode').then(({ default: QRCode }) => {
      const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
      let d = '';
      for (let y = 0; y < modules.size; y++) {
        for (let x = 0; x < modules.size; x++) {
          if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
        }
      }
      if (!zruseno) setQr({ velikost: modules.size, d });
    }).catch(() => { /* bez QR zůstane odkaz textem */ });
    return () => { zruseno = true; };
  }, [text]);
  return qr;
}

const NavodDesktop: React.FC = () => {
  const qr = useQrCesta(URL_NAVODU);
  const okraj = 2;

  return (
    <div className="p-5 rounded-2xl bg-povrch border border-slate-800 flex flex-col sm:flex-row items-center gap-5">
      <div className="w-44 h-44 p-2 rounded-xl bg-white shrink-0 flex items-center justify-center">
        {qr ? (
          <svg
            viewBox={`${-okraj} ${-okraj} ${qr.velikost + 2 * okraj} ${qr.velikost + 2 * okraj}`}
            className="w-full h-full text-pozadi"
            role="img"
            aria-label={`QR kód na ${URL_NAVODU}`}
            shapeRendering="crispEdges"
          >
            <path d={qr.d} fill="currentColor" />
          </svg>
        ) : (
          <Smartphone className="w-10 h-10 text-slate-400" />
        )}
      </div>
      <div className="space-y-2 text-center sm:text-left">
        <p className="text-sm font-bold text-white">Otevři app.bodyandmindon.cz v telefonu</p>
        <p className="text-xs text-slate-400">
          Naskenuj QR kód fotoaparátem — otevře se tenhle návod pro tvůj telefon.
        </p>
        <p className="text-xs font-mono text-akcent-cyan break-all">{URL_NAVODU.replace('https://', '')}</p>
      </div>
    </div>
  );
};

/**
 * Stránka /instalace — veřejná, bez přihlášení (vede sem QR kód i odkaz
 * z přihlašovací obrazovky).
 */
export const StrankaInstalace: React.FC = () => (
  <div className="min-h-screen bg-pozadi text-slate-100 font-['Plus_Jakarta_Sans',sans-serif] px-4 py-6">
    <div className="w-full max-w-md mx-auto space-y-6">
      <button
        type="button"
        onClick={() => naviguj('/profil')}
        className="inline-flex items-center gap-1.5 min-h-11 text-sm text-slate-300 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Zpět do aplikace</span>
      </button>

      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold text-white leading-tight">BMON jako aplikace na ploše</h1>
        <p className="text-sm text-slate-400">Bez App Storu, bez instalace. Jedno klepnutí.</p>
      </div>

      <InstalaceNavod />
    </div>
  </div>
);
