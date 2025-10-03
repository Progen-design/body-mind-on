import { useState } from 'react'

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
  },
]

export default function Pricing() {
  const [selected, setSelected] = useState(null)

  return (
    <div className="container">
      <h1>Ceník</h1>
      <p>Vyber plán, který ti nejvíc vyhovuje, a níže formulář.</p>

      <div
        className="pricing-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '24px',
          marginTop: '32px',
        }}
      >
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`card ${selected === plan.id ? 'selected' : ''}`}
            onClick={() => setSelected(plan.id)}
            style={{
              cursor: 'pointer',
              border:
                selected === plan.id
                  ? '2px solid var(--accent)'
                  : '1px solid var(--border)',
              transition: 'all .2s',
            }}
          >
            {plan.recommended && (
              <div
                style={{
                  position: 'absolute',
                  top: '-10px',
                  right: '-10px',
                  background: 'var(--accent)',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              >
                Doporučeno
              </div>
            )}
            <h2>{plan.title}</
