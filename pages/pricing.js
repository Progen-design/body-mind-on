// pages/pricing.js
import { useState } from 'react'
import Link from 'next/link'

const plans = [
  {
    id: 'start',
    title: 'Start',
    price: 'ZDARMA',
    perks: [
      '1× ukázkový jídelníček + 1× trénink',
      'Evidence váhy a měření',
      'Základní tipy e-mailem',
    ],
  },
  {
    id: 'individual',
    title: 'Individuální',
    price: '1 490 Kč / měsíc',
    perks: [
      'Plán na míru bez trenéra',
      'AI jídelníček + trénink každý týden',
      'Automatické úpravy podle výsledků',
      'Tipy pro spánek, stres, regeneraci',
    ],
    recommended: true,
  },
  {
    id: 'group',
    title: 'Skupina',
    price: '2 490 Kč / měsíc',
    perks: [
      'Vše z balíčku Individuální',
      '1× skupinový trénink měsíčně',
      'Přístup do komunity',
      'Q&A s koučem 1× za měsíc',
    ],
  },
  {
    id: 'addon',
    title: 'Add-on: Osobní trénink',
    price: '60 min = 1 190 Kč / 90 min = 1 690 Kč',
    perks: [
      'Možnost doobjednat kdykoliv',
      'Balíčky (5×, 10×) – sleva',
      'Storno do 24 h zdarma',
    ],
  }
]

export default function Pricing() {
  const [selected, setSelected] = useState(null)

  return (
    <div className="container" style={{padding: '40px 0'}}>
      <h1>Ceník</h1>
      <p>Vyber plán, který ti nejvíc vyhovuje, a následuj formulář.</p>
      <div className="pricing-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '24px',
        marginTop: '32px'
      }}>
        {plans.map(plan => (
          <div
            key={plan.id}
            className={`card ${selected === plan.id ? 'selected' : ''}`}
            onClick={() => setSelected(plan.id)}
            style={{
              cursor: 'pointer',
              border: selected === plan.id
                ? '2px solid var(--accent)'
                : '1px solid var(--border)',
              transition: 'all .2s'
            }}
          >
            {plan.recommended && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                background: 'var(--accent)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '8px',
                fontSize: '12px'
              }}>
                Doporučeno
              </div>
            )}
            <h2>{plan.title}</h2>
            <p style={{fontSize: '1.2rem', fontWeight: '600', margin: '12px 0'}}>
              {plan.price}
            </p>
            <ul style={{ color: 'var(--muted)', margin: '12px 0 0 16px' }}>
              {plan.perks.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            <button
              className="submit"
              style={{ marginTop: '18px', width: '100%' }}
            >
              {selected === plan.id ? 'Vybráno' : 'Zvolit'}
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{marginTop: '48px'}}>
          <h2>Formulář pro plán <strong>{plans.find(p=>p.id===selected).title}</strong></h2>
          {/* Sem vlož existující formulář z indexu s drobnou úpravou: přidej skryté pole planId */}
          {/* Můžeš zkopírovat kod z index a předat plan jako hidden input planId = selected */}
        </div>
      )}
    </div>
  )
}
