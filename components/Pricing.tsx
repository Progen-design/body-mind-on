import { PRICING, ADDON } from '@/lib/pricing';

export default function Pricing({ minimal = false }) {
  return (
    <section className="pricing">
      <div className="grid">
        {PRICING.map(t => (
          <article key={t.id} className="card">
            {t.badge && <span className="badge">{t.badge}</span>}
            <h3>{t.name}</h3>
            {t.subtitle && <p className="sub">{t.subtitle}</p>}
            <div className="price">{t.priceLabel || (t.priceCzk ? `${t.priceCzk.toLocaleString('cs-CZ')} Kč/měsíc` : 'ZDARMA')}</div>
            <ul>{t.features.map(f => <li key={f}>{f}</li>)}</ul>
            {!minimal && <a className="btn" href={t.cta.href}>{t.cta.label}</a>}
          </article>
        ))}
      </div>

      {!minimal && (
        <aside className="addon">
          <h4>{ADDON.title}</h4>
          <ul>{ADDON.items.map(i => <li key={i}>{i}</li>)}</ul>
          <p className="note">{ADDON.note}</p>
        </aside>
      )}
    </section>
  );
}
