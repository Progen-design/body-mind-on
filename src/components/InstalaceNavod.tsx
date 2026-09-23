import React, { useEffect, useRef, useState } from 'react';
import {
  Share,
  SquarePlus,
  CheckCircle2,
  Ellipsis,
  EllipsisVertical,
  Menu,
  Download,
  Smartphone,
  ArrowLeft,
  Info,
  AppWindow,
  Copy,
  Check,
} from 'lucide-react';
import { naviguj } from '../routing';
import {
  KROKY,
  POZNAMKA_ZNOVU,
  URL_NAVODU,
  aktualniVyzva,
  beziZPlochy,
  jeNainstalovano,
  odebirejVyzvu,
  prohlizecZParametru,
  rozpoznejProhlizec,
  spotrebujVyzvu,
  umiTlacitkoInstalace,
  uvodKroku,
  type IkonaKroku,
  type KrokNavodu,
  type RozpoznanyProhlizec,
} from '../lib/instalace';

/**
 * NÁVOD „PŘIDAT NA PLOCHU" — na míru prohlížeči.
 *
 * - Android Chrome / Edge / Samsung: velké tlačítko „Nainstalovat aplikaci"
 *   (výzva `beforeinstallprompt` zachycená v main.tsx). Dokud nepřišla,
 *   kroky přes menu. Po `appinstalled` „Hotovo".
 * - iOS Safari / Chrome / Firefox / Edge, Android Firefox: kroky pro daný
 *   prohlížeč (texty v lib/instalace.ts → KROKY).
 * - In-app prohlížeč (Instagram, Facebook…): napřed „Otevřít v prohlížeči"
 *   + „Kopírovat odkaz", pod tím kroky pro Safari / Chrome.
 * - Počítač: QR kód na tuhle stránku.
 * - Už z plochy: „Máš hotovo".
 *
 * `?ua=ios-chrome` apod. přepíše detekci — jen pro kontrolu na počítači.
 */
function zjistiProhlizec(): { prohlizec: RozpoznanyProhlizec; prepsano: boolean } {
  const prepis = prohlizecZParametru(new URLSearchParams(window.location.search).get('ua'));
  if (prepis) return { prohlizec: prepis, prepsano: true };
  return { prohlizec: rozpoznejProhlizec(navigator.userAgent, navigator.maxTouchPoints), prepsano: false };
}

/** Sleduje výzvu k instalaci a `appinstalled` — stejný zdroj jako InstallBanner. */
function useStavInstalace() {
  const precti = () => ({ maVyzvu: aktualniVyzva() !== null, hotovo: jeNainstalovano() });
  const [stav, setStav] = useState(precti);
  useEffect(() => odebirejVyzvu(() => setStav(precti())), []);
  return stav;
}

const InstalaceNavod: React.FC = () => {
  const [{ prohlizec, prepsano }] = useState(zjistiProhlizec);
  const { maVyzvu, hotovo } = useStavInstalace();

  if ((beziZPlochy() && !prepsano) || hotovo) return <Hotovo />;
  if (prohlizec.platforma === 'desktop') return <NavodDesktop />;

  const kroky = KROKY[prohlizec.platforma][prohlizec.prohlizec];
  const tlacitko = umiTlacitkoInstalace(prohlizec) && maVyzvu;

  return (
    <div className="space-y-4">
      {tlacitko && <TlacitkoInstalace />}
      <div className="space-y-3">
        {tlacitko && <p className="text-xs text-slate-500">Nebo ručně:</p>}
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{uvodKroku(prohlizec.prohlizec)}</p>
        <ol>
          {kroky.map((k, i) => (
            <Krok key={k.text} cislo={i + 1} krok={k} />
          ))}
        </ol>
        <p className="flex items-start gap-2 pt-1 text-xs text-slate-400">
          <Info className="w-4 h-4 shrink-0 text-amber-300" />
          <span>{POZNAMKA_ZNOVU}</span>
        </p>
      </div>
    </div>
  );
};

const Hotovo: React.FC = () => (
  <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 flex items-start gap-3">
    <CheckCircle2 className="w-6 h-6 text-akcent-lime shrink-0" />
    <p className="text-sm font-semibold text-slate-100">Máš hotovo — BMON už běží jako aplikace.</p>
  </div>
);

const TlacitkoInstalace: React.FC = () => {
  const nainstaluj = async () => {
    const vyzva = aktualniVyzva();
    if (!vyzva) return;
    spotrebujVyzvu();
    await vyzva.prompt();
    // Přijetí ohlásí `appinstalled` → useStavInstalace přepne na „Hotovo".
  };

  return (
    <button
      type="button"
      onClick={nainstaluj}
      className="w-full min-h-14 rounded-2xl text-base font-bold text-slate-950 bg-akcent-cyan inline-flex items-center justify-center gap-2.5 shadow-[0_8px_24px_rgba(0,242,254,0.3)]"
    >
      <Download className="w-5 h-5" />
      <span>Nainstalovat aplikaci</span>
    </button>
  );
};

const IKONY: Record<IkonaKroku, React.ReactNode> = {
  'menu-vedle-adresy': (
    <>
      <Ellipsis className="w-5 h-5" />
      <Share className="w-3.5 h-3.5 opacity-70" />
    </>
  ),
  menu: <Menu className="w-5 h-5" />,
  'menu-svisle': <EllipsisVertical className="w-5 h-5" />,
  sdilet: <Share className="w-5 h-5" />,
  pridat: <SquarePlus className="w-5 h-5" />,
  potvrdit: <CheckCircle2 className="w-5 h-5" />,
  aplikace: <AppWindow className="w-5 h-5" />,
};

/**
 * Jeden krok návodu. NESMÍ VYPADAT JAKO TLAČÍTKO — dřív to byly karty
 * s rámečkem a lidé na ně klepali, místo aby hledali menu v prohlížeči.
 * Řádek: číslo, ikona, text, mezi kroky jen tenká linka. Žádný hover,
 * žádný kurzor. Výjimka je zvýrazněný krok „Otevřít v prohlížeči" v in-app
 * prohlížeči — ten má vlastní tlačítko „Kopírovat odkaz".
 */
const Krok: React.FC<{ cislo: number; krok: KrokNavodu }> = ({ cislo, krok }) => (
  <li
    className={`py-3 border-b border-slate-800/70 last:border-b-0 ${
      krok.zvyrazneny ? '-mx-3 px-3 mb-2 rounded-xl bg-amber-950/30 border border-amber-500/40' : ''
    }`}
  >
    <div className="flex items-center gap-3">
      <span className="w-5 text-sm font-bold text-slate-500 tabular-nums shrink-0" aria-hidden="true">
        {cislo}.
      </span>
      <span
        className={`w-10 flex items-center justify-center gap-1 shrink-0 ${krok.zvyrazneny ? 'text-amber-300' : 'text-akcent-cyan'}`}
        aria-hidden="true"
      >
        {IKONY[krok.ikona]}
      </span>
      <span className="text-sm text-slate-200 leading-snug">{krok.text}</span>
    </div>
    {krok.zvyrazneny && <KopirovatOdkaz />}
  </li>
);

/**
 * „Kopírovat odkaz" pro in-app prohlížeč: odkaz se pak vloží do Safari /
 * Chromu. Když schránka nejde (starší WebView ji blokuje), ukáže se pole
 * s označeným odkazem ke zkopírování ručně.
 */
const KopirovatOdkaz: React.FC = () => {
  const [stav, setStav] = useState<'nic' | 'hotovo' | 'rucne'>('nic');
  const pole = useRef<HTMLInputElement>(null);
  const odkaz = window.location.href;

  useEffect(() => {
    if (stav === 'rucne') pole.current?.select();
  }, [stav]);

  const kopiruj = async () => {
    try {
      await navigator.clipboard.writeText(odkaz);
      setStav('hotovo');
    } catch {
      setStav('rucne');
    }
  };

  return (
    <div className="mt-2.5 pl-8 space-y-2">
      <button
        type="button"
        onClick={kopiruj}
        className="min-h-10 px-3.5 rounded-xl text-xs font-bold text-slate-950 bg-amber-300 inline-flex items-center gap-1.5"
      >
        {stav === 'hotovo' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{stav === 'hotovo' ? 'Zkopírováno' : 'Kopírovat odkaz'}</span>
      </button>
      {stav === 'rucne' && (
        <input
          ref={pole}
          type="text"
          readOnly
          value={odkaz}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Odkaz na návod ke zkopírování"
          className="w-full min-h-10 px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 font-mono"
        />
      )}
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
