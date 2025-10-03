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
  }
]

export default function Pricing() {
  const [selected, setSelected] = useState(null)

  return (
    <div className="container">
      <h1>Ceník</h1>
      <p>Vyber plán, který ti nejvíc vyhovuje, a níže formulář.</p>

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

      {/* Pokud má uživatel vybraný plán, zobraz formulář */}
      {selected && (
        <div style={{ marginTop: '48px' }}>
          <h2>Formulář pro plán <strong>{plans.find(p => p.id === selected).title}</strong></h2>
          <FormWithPlan plan={selected} />
        </div>
      )}
    </div>
}

// Můžeš vložit tento import nad
function FormWithPlan({ plan }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const form = new FormData(e.currentTarget)
    const payload = {
      email: form.get('email') || '',
      name: form.get('name') || '',
      gender: form.get('gender') || 'Muž',
      age: Number(form.get('age') || 0),
      height_cm: Number(form.get('height_cm') || 0),
      weight_kg: Number(form.get('weight_kg') || 0),
      activity: form.get('activity') || 'Středně aktivní',
      stress: form.get('stress') || 'Střední',
      job: form.get('job') || 'Kancelář / IT',
      goal: form.get('goal') || 'Redukce hmotnosti',
      weekly_sessions: form.get('weekly_sessions') || '2–3× týdně',
      plan: plan,
    }

    try {
      // Zde vlož svůj kód, jak vkládáš do Supabase:
      // const { error } = await supabase.from('body_metrics').insert(payload)
      await new Promise(r => setTimeout(r, 600))  // dummy
      setMessage({ type: 'ok', text: 'Odesláno – čekej instrukce v emailu.' })
      e.currentTarget.reset()
    } catch (err) {
      setMessage({ type: 'err', text: 'Špatně – zkus to znovu.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="form">
      <div className="row">
        <div>
          <label className="label">Email (povinný)</label>
          <input className="input" name="email" type="email" placeholder="např. jan@domena.cz" required />
        </div>
        <div>
          <label className="label">Jméno a příjmení</label>
          <input className="input" name="name" type="text" placeholder="Jan Novák" />
        </div>
      </div>

      <div className="row">
        <div>
          <label className="label">Pohlaví</label>
          <select className="select" name="gender" defaultValue="Muž">
            <option>Muž</option>
            <option>Žena</option>
          </select>
        </div>
        <div>
          <label className="label">Věk (roky)</label>
          <input className="input" name="age" type="number" min="10" max="100" placeholder="30" />
        </div>
      </div>

      <div className="row">
        <div>
          <label className="label">Výška (cm)</label>
          <input className="input" name="height_cm" type="number" min="120" max="230" placeholder="180" />
        </div>
        <div>
          <label className="label">Váha (kg)</label>
          <input className="input" name="weight_kg" type="number" min="35" max="250" placeholder="80" />
        </div>
      </div>

      <div className="row">
        <div>
          <label className="label">Aktivita</label>
          <select className="select" name="activity" defaultValue="Středně aktivní">
            <option>Mírně aktivní</option>
            <option>Středně aktivní</option>
            <option>Vysoce aktivní</option>
          </select>
        </div>
        <div>
          <label className="label">Míra stresu</label>
          <select className="select" name="stress" defaultValue="Střední">
            <option>Nízká</option>
            <option>Střední</option>
            <option>Vysoká</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div>
          <label className="label">Typ práce</label>
          <select className="select" name="job" defaultValue="Kancelář / IT">
            <option>Kancelář / IT</option>
            <option>Manuální</option>
            <option>Směnný provoz</option>
          </select>
        </div>
        <div>
          <label className="label">Cíl</label>
          <select className="select" name="goal" defaultValue="Redukce hmotnosti">
            <option>Redukce hmotnosti</option>
            <option>Nárůst svalů</option>
            <option>Udržení</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Frekvence cvičení</label>
        <select className="select" name="weekly_sessions" defaultValue="2–3× týdně">
          <option>1× týdně</option>
          <option>2–3× týdně</option>
          <option>4–5× týdně</option>
        </select>
      </div>

      <button className="submit" type="submit" disabled={loading}>
        {loading ? 'Odesílám…' : 'Začít moji cestu'}
      </button>
      {message && (
        <p className="note" style={{ color: message.type === 'ok' ? 'var(--success)' : 'var(--error)' }}>
          {message.text}
        </p>
      )}
    </form>
  )
}
