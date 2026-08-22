import { isOnClubSalesEnabled, isVipSalesEnabled } from '../lib/salesFeatureFlags';
import {
  ON_CLUB_VARIANT_PRICE_LABEL,
  START_VARIANT_PRICE_LABEL,
  VIP_PRICE_LABEL,
} from '../lib/pricing';

const WAITLIST_COPY = 'Připravujeme — přidej se na waitlist';

const PROGRAM_VARIANTS = [
  {
    id: 'START',
    name: 'START',
    price: START_VARIANT_PRICE_LABEL,
    description: 'Jednoduchý plán pro člověka, který chce vědět, co má dělat, bez komunity a osobního vedení.',
    benefits: [
      'Individuální tréninkový plán',
      'Individuální jídelní plán',
      'Týdenní automatická úprava plánu',
      'Napojení chytrého zařízení — nastavení zdarma',
      'E-book 7 pilířů zdraví',
    ],
    cta: 'Pokračovat ve STARTU',
    href: '/start',
    badge: null,
  },
  {
    id: 'ON_CLUB',
    name: 'ON CLUB',
    price: ON_CLUB_VARIANT_PRICE_LABEL,
    description: 'Komunita, AI trenér TED a dlouhodobé vedení. Místo, kde na své cestě nejsi sám.',
    benefits: [
      'Vše ze STARTU',
      'AI trenér TED 24/7',
      'Soukromá komunita a výzvy',
      'Exkluzivní obsah pro tělo a mysl',
      'Každý měsíc živě s Ondrou — ptej se na trénink, jídlo a motivaci',
    ],
    cta: 'Vstoupit do ON CLUBU',
    href: '/on-club',
    badge: 'Doporučeno',
    featured: true,
  },
  {
    id: 'VIP',
    name: 'VIP PERFORMANCE',
    price: VIP_PRICE_LABEL,
    description: 'Prémiové osobní vedení pro klienty, kteří chtějí maximální podporu, strategii a accountability.',
    benefits: [
      'Vše z ON CLUBU',
      '2× měsíčně videohovor s Ondrou',
      'Strategie a úpravy na míru',
      'Prioritní komunikace',
      'Nejvyšší úroveň accountability',
    ],
    cta: 'Mám zájem o VIP',
    href: '/chci-vip',
    badge: 'Osobní coaching',
  },
  {
    id: '12T',
    name: '12T TRANSFORMACE',
    price: 'Vstupní program',
    description: '12 týdnů krok za krokem ve stejném systému — skupinová vlna a vstup do ON CLUBu.',
    benefits: [
      '12 týdnů strukturovaného programu',
      'Vše ze STARTu — plán, jídlo, týdenní úpravy',
      'Skupinová podpora ve vlně',
      'Po 12. týdnu vstup do ON CLUBu',
    ],
    cta: 'Chci 12T transformaci',
    href: 'mailto:info@bodyandmindon.cz?subject=12T%20Transformace%20-%20p%C5%99edb%C4%9B%C5%BEn%C3%BD%20z%C3%A1jem',
    badge: 'Připravujeme',
    preparing: true,
  },
];

function normalizeProgram(value) {
  const raw = String(value || 'START').toUpperCase();
  if (raw === 'ON CLUB') return 'ON_CLUB';
  return raw;
}

export default function ProgramVariantsSection({
  currentProgram = 'START',
  isTrialExpired = false,
  daysUntilTrialEnd = null,
}) {
  const activeProgram = normalizeProgram(currentProgram);
  const days = Number(daysUntilTrialEnd);
  const nearExpiry = Number.isFinite(days) && days >= 0 && days <= 5;
  const urgent = Boolean(isTrialExpired) || nearExpiry;
  const onClubEnabled = isOnClubSalesEnabled();
  const vipEnabled = isVipSalesEnabled();

  function variantSalesEnabled(variantId) {
    if (variantId === 'ON_CLUB') return onClubEnabled;
    if (variantId === 'VIP') return vipEnabled;
    return true;
  }

  return (
    <section
      id="program-variants"
      className={`program-variants ${urgent ? 'program-variants--urgent' : ''}`}
      aria-labelledby="program-variants-title"
    >
      <div className="program-variants__intro">
        <p className="program-variants__eyebrow">Pokračuj v Body &amp; Mind ON</p>
        <h2 id="program-variants-title" className="program-variants__title">
          Vyber si další krok v Body &amp; Mind ON
        </h2>
        <p className="program-variants__subtitle">
          Nejde jen o aplikaci. Jde o systém, který tě vede k lepšímu tělu, více energii a větší pohodě.
        </p>
        {urgent ? (
          <p className="program-variants__urgency" role="status">
            {isTrialExpired
              ? 'Tvůj START přístup vypršel — vyber další krok a navázaný systém bez pauzy.'
              : `START končí za ${days === 0 ? 'dnes' : days === 1 ? '1 den' : `${days} dní`} — aktivuj navazující plán včas.`}
          </p>
        ) : null}
      </div>

      <div className="program-variants__grid">
        {PROGRAM_VARIANTS.map((variant) => {
          const salesEnabled = variantSalesEnabled(variant.id);
          const isPreparing = variant.preparing || !salesEnabled;
          const isCurrent = activeProgram === variant.id
            || (variant.id === 'ON_CLUB' && activeProgram === 'ON_CLUB')
            || (variant.id === 'VIP' && activeProgram === 'VIP');
          const cardClass = [
            'program-variants__card',
            variant.featured ? 'program-variants__card--featured' : '',
            isCurrent ? 'program-variants__card--current' : '',
            variant.preparing ? 'program-variants__card--preparing' : '',
            isPreparing ? 'program-variants__card--preparing' : '',
          ].filter(Boolean).join(' ');

          return (
            <article key={variant.id} className={cardClass}>
              {variant.badge ? (
                <span className="program-variants__card-badge">{variant.badge}</span>
              ) : null}
              {isCurrent ? (
                <span className="program-variants__card-current">Tvůj aktuální plán</span>
              ) : null}
              {isPreparing && !variant.preparing ? (
                <span className="program-variants__card-badge">Připravujeme</span>
              ) : null}
              <h3 className="program-variants__card-name">{variant.name}</h3>
              <p className="program-variants__card-price">{variant.price}</p>
              <p className="program-variants__card-desc">{variant.description}</p>
              <ul className="program-variants__benefits">
                {variant.benefits.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {salesEnabled ? (
                <a
                  href={variant.href}
                  className={`program-variants__cta ${variant.featured ? 'program-variants__cta--featured' : ''}`}
                  {...(variant.preparing ? { rel: 'noopener noreferrer' } : {})}
                >
                  {isCurrent && variant.id === 'START' ? 'Pokračovat ve STARTU' : variant.cta}
                </a>
              ) : (
                <span className="program-variants__cta program-variants__cta--disabled" aria-disabled="true">
                  {WAITLIST_COPY}
                </span>
              )}
            </article>
          );
        })}
      </div>

      <style jsx>{`
        .program-variants {
          width: 100%;
          max-width: min(1180px, 100%);
          margin: 0 auto 28px;
          padding: clamp(1rem, 4vw, 1.5rem);
          border-radius: 22px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background:
            radial-gradient(circle at 100% 0%, rgba(124, 58, 237, 0.16), transparent 42%),
            radial-gradient(circle at 0% 100%, rgba(14, 165, 233, 0.12), transparent 40%),
            linear-gradient(160deg, rgba(10, 15, 30, 0.96), rgba(18, 11, 38, 0.94));
          box-shadow: 0 18px 40px rgba(2, 6, 23, 0.42);
          box-sizing: border-box;
        }
        .program-variants--urgent {
          border-color: rgba(96, 165, 250, 0.45);
          box-shadow: 0 20px 44px rgba(37, 99, 235, 0.18);
        }
        .program-variants__intro {
          margin-bottom: clamp(1rem, 3vw, 1.25rem);
        }
        .program-variants__eyebrow {
          margin: 0 0 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #a78bfa;
        }
        .program-variants__title {
          margin: 0 0 10px;
          color: #f8fafc;
          font-size: clamp(1.35rem, 4.5vw, 1.75rem);
          line-height: 1.2;
          letter-spacing: -0.02em;
        }
        .program-variants__subtitle {
          margin: 0;
          max-width: 760px;
          color: #cbd5e1;
          font-size: clamp(0.9rem, 2.8vw, 1rem);
          line-height: 1.65;
        }
        .program-variants__urgency {
          margin: 12px 0 0;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(96, 165, 250, 0.35);
          background: rgba(30, 64, 175, 0.22);
          color: #dbeafe;
          font-size: 14px;
          line-height: 1.5;
        }
        .program-variants__grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(0.75rem, 2.5vw, 1rem);
        }
        .program-variants__card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: clamp(1rem, 3vw, 1.25rem);
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.55);
          box-sizing: border-box;
          width: 100%;
        }
        .program-variants__card--featured {
          border-color: rgba(167, 139, 250, 0.65);
          background:
            radial-gradient(circle at 0% 0%, rgba(124, 58, 237, 0.28), transparent 55%),
            rgba(30, 27, 75, 0.72);
          box-shadow: 0 10px 28px rgba(91, 33, 182, 0.25);
        }
        .program-variants__card--current {
          border-color: rgba(34, 197, 94, 0.45);
        }
        .program-variants__card--preparing {
          border-style: dashed;
        }
        .program-variants__card-badge {
          align-self: flex-start;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #ede9fe;
          background: rgba(124, 58, 237, 0.45);
        }
        .program-variants__card--featured .program-variants__card-badge {
          color: #fff;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
        }
        .program-variants__card--preparing .program-variants__card-badge {
          color: #fde68a;
          background: rgba(161, 98, 7, 0.45);
        }
        .program-variants__card-current {
          align-self: flex-start;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          color: #bbf7d0;
          background: rgba(22, 101, 52, 0.45);
        }
        .program-variants__card-name {
          margin: 0;
          color: #f8fafc;
          font-size: clamp(1.05rem, 3.2vw, 1.2rem);
          line-height: 1.25;
        }
        .program-variants__card-price {
          margin: 0;
          color: #c4b5fd;
          font-size: clamp(0.95rem, 2.8vw, 1.05rem);
          font-weight: 700;
        }
        .program-variants__card-desc {
          margin: 0;
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.55;
        }
        .program-variants__benefits {
          margin: 0;
          padding-left: 1.1rem;
          color: #e2e8f0;
          font-size: 13px;
          line-height: 1.55;
        }
        .program-variants__benefits li + li {
          margin-top: 4px;
        }
        .program-variants__cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
          margin-top: auto;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.75);
          color: #f8fafc;
          text-decoration: none;
          font-size: 14px;
          font-weight: 700;
          text-align: center;
          touch-action: manipulation;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .program-variants__cta:hover {
          transform: translateY(-1px);
          border-color: rgba(196, 181, 253, 0.75);
        }
        .program-variants__cta--featured {
          border-color: rgba(167, 139, 250, 0.8);
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          box-shadow: 0 8px 22px rgba(91, 33, 182, 0.35);
        }
        .program-variants__cta--disabled {
          opacity: 0.72;
          cursor: not-allowed;
          pointer-events: none;
        }
        @media (min-width: 768px) {
          .program-variants__grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .program-variants__card--featured {
            grid-column: 1 / -1;
          }
        }
        @media (min-width: 1100px) {
          .program-variants__grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .program-variants__card--featured {
            grid-column: span 2;
            grid-row: span 1;
          }
        }
      `}</style>
    </section>
  );
}
