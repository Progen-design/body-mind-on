import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { KomunitaOdpoved } from './typy';

/**
 * KOMENTÁŘE POD PŘÍSPĚVKEM VE FEEDU.
 *
 * Poslední dvě odpovědi v kompaktním řádku „přezdívka: text", odkaz na
 * celé vlákno a řádek „Napiš komentář…". Psát se chodí do detailu —
 * tam je chatovací lišta, souhlas s pravidly a je vidět, na co se odpovídá.
 *
 * ŽÁDNÝ REQUEST NA KARTU. `GET /api/community` posílá `last_replies`
 * s sebou; kdyby si každá karta došla pro komentáře sama, znamenal by
 * jeden scroll feedu dvacet dotazů navíc.
 */
interface Props {
  odpovedi: KomunitaOdpoved[];
  celkem: number;
  /** Otevře vlákno. `fokus` = kurzor rovnou do chatovací lišty. */
  onOtevriDetail: (fokus: boolean) => void;
  /** START čte, nepíše — řádek „Napiš komentář…" se nekreslí. */
  jenCteni?: boolean;
}

export const KomentareVKarte: React.FC<Props> = ({ odpovedi, celkem, onOtevriDetail, jenCteni = false }) => {
  // Server posílá až tři poslední — ve feedu stačí dvě.
  const nahled = odpovedi.slice(-2);
  return (
    <div className="px-4 space-y-1">
      {nahled.map((o) => (
        <p key={o.id} className="text-[13px] leading-snug text-slate-300 break-words line-clamp-2">
          <span className="font-bold text-slate-100">{o.author_name}</span>
          {o.is_team && <StitekTym />}
          <span className="text-slate-500">: </span>
          {o.content}
        </p>
      ))}

      {celkem > nahled.length && (
        <button
          type="button"
          onClick={() => onOtevriDetail(false)}
          className="block min-h-8 text-[13px] text-slate-500 hover:text-slate-300"
        >
          Zobrazit všech {celkem}
        </button>
      )}

      {!jenCteni && (
        <button
          type="button"
          onClick={() => onOtevriDetail(true)}
          className="w-full min-h-11 text-left text-[13px] text-slate-500 hover:text-slate-300"
        >
          Napiš komentář…
        </button>
      )}
    </div>
  );
};

/** Štítek týmové odpovědi. Rada od nás musí být k rozeznání od rady kohokoli jiného. */
export const StitekTym: React.FC = () => (
  <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold align-middle text-akcent-lime bg-lime-950/60 border border-lime-500/40">
    <BadgeCheck className="w-2.5 h-2.5" />
    Tým BMON
  </span>
);
