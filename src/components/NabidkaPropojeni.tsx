import React from 'react';
import { Mail } from 'lucide-react';

/**
 * Nabídka pomoci s propojením zařízení.
 *
 * JEDNO MÍSTO PRAVDY PRO TENHLE TEXT. Objevuje se všude, kde uživatel
 * narazí na nepropojené zařízení — v profilu, na Tělo & Váha i v prázdném
 * stavu Regenerace & Spánek. Kdyby se text psal na každém místě zvlášť,
 * rozešly by se navzájem hned při první úpravě.
 *
 * ŽÁDNÁ CENA. Váha se domlouvá podle toho, co klient chce, takže číslo
 * v UI by bylo tvrzení, které nikdo nezaručí. Cenu řekne odpověď na e-mail.
 */

/** Adresa, kam nabídka směřuje. Stejná jako v patičce webu. */
export const KONTAKTNI_EMAIL = 'info@bodyandmindon.cz';

const PREDMET = encodeURIComponent('Propojení zařízení');
const TELO = encodeURIComponent(
  'Dobrý den,\n\nmám zájem o pomoc s propojením zařízení.\n\n'
  + 'Zařízení, které mám (nebo bych chtěl/a):\n\n'
);

interface Props {
  /** Kompaktní varianta do karty. Výchozí je samostatný blok. */
  kompaktni?: boolean;
}

export const NabidkaPropojeni: React.FC<Props> = ({ kompaktni = false }) => (
  <div
    className={`rounded-2xl bg-cyan-950/25 border border-cyan-500/25 ${
      kompaktni ? 'p-3' : 'p-4'
    }`}
  >
    <p className={`text-slate-300 leading-relaxed ${kompaktni ? 'text-[11px]' : 'text-xs'}`}>
      <span className="font-bold text-white">Nechceš to řešit sám?</span>{' '}
      Propojíme ti hodinky i chytrou váhu zdarma. A když váhu ještě nemáš,
      objednáš si ji přímo u nás — ozvi se a domluvíme, co ti sedne.
    </p>
    <a
      href={`mailto:${KONTAKTNI_EMAIL}?subject=${PREDMET}&body=${TELO}`}
      className={`mt-2.5 inline-flex items-center gap-1.5 font-bold text-akcent-cyan hover:text-cyan-300 transition-colors ${
        kompaktni ? 'text-[11px]' : 'text-xs'
      }`}
    >
      <Mail className="w-3.5 h-3.5 shrink-0" />
      <span>{KONTAKTNI_EMAIL}</span>
    </a>
  </div>
);
