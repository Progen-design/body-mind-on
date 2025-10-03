import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

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
    title: 'Add-on: Osobní lekce',
    price: '60 min = 1 190 Kč / 90 min = 1 690 Kč',
    perks: [
      'Doobjednej kdykoliv',
      'Balíčky (5×, 10×) – sleva',
      'Storno do 24 h zdarma',
    ],
  }
]

export default function Home() {
  const [selected, setSelected] = useState(null)
  const [step, setStep] = useState('choosePlan')  
  // step: "choosePlan" → uživatel vybírá plán  
  //         "register" → jméno + email  
  //         "form" → zbytek dat (výška, váha...)  

  const [regData, setRegData] = useState({
    name: '',
    email: ''
  })

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  function handleSelectPlan(planId) {
    setSelected(planId)
    if (planId === 'start') {
      // pro Start okamžitě přejít na registraci / formulář
      setStep('register')
    } else {
      setStep('register')
    }
  }

  function handleRegisterSubmit(e) {
    e.preventDefault()
    // ověření jméno + email
    const name = e.target.name.value.trim()
    const email = e.target.email.value.trim()
    if (!name || !email) {
      setMessage({ type: 'err', text: 'Vyplň jméno i email.' })
      return
    }
    setRegData({ name, email })
    setStep('form')
    setMessage(null)
  }

  async function handleFullSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const form = new FormData(e.currentTarget)
    const payload = {
      name: regData.name,
      email: regData.email,
      plan: selected,
      // další pole:
      gender: form.get('gender'),
      age: Number(form.get('age') || 0),
      height_cm: Number(form.get('height_cm') || 0),
      weight_kg: Number(form.get('weight_kg') || 0),
      activity: form.get('activity'),
      stress: form.get('stress'),
      job: form.get('job'),
      goal: form.get('goal'),
      weekly_sessions: form.get('weekly_sessions'),
    }

    try {
      // TODO: supabase insert payload
      // const { error } = await supabase.from('body_metrics').insert(payload)
      await new Promise(r=>setTimeout(r, 600))
      setMessage({ type: 'ok', text: 'Registrace dokončena!' })
      e.currentTarget.reset()
      setStep('choosePlan')
      setSelected(null)
    } catch (err) {
      setMessage({ type: 'err', text: 'Chyba – zkus znovu.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="container">
        <section className="hero">
          <div>
            <h1>Body & Mind ON</h1>
            <p>Kompletní systém pro <strong>silné tělo</strong>, více energie a pevné sebevědomí.</p>
          </div>
        </section>

        <section style={{ marginTop: '48px' }}>
          <h2 style={{textAlign:'center'}}>Ceník</h2>
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
            Vyber plán, který ti nejvíc vyhovuje. Add-ony lze dokoupit později.
          </p>
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
                onClick={() => handleSelectPlan(plan.id)}
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
                  }}>Doporučeno</div>
                )}
                <h3>{plan.title}</h3>
                <p style={{ fontSize: '1.2rem', fontWeight: '600', margin: '12px 0' }}>
                  {plan.price}
                </p>
                <ul style={{ color: 'var(--muted)', margin: '12px 0 0 16px' }}>
                  {plan.perks.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                <button className="submit"
                  style={{ marginTop: '18px', width: '100%' }}
                  disabled={selected === plan.id && step === 'register'}
                >
                  {selected === plan.id ? 'Vybráno' : 'Zvolit'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {step === 'register' && selected && (
          <section style={{ marginTop: '48px' }}>
            <h2>Registrovat pro plán „{plans.find(p=>p.id===selected).title}“</h2>
            <form onSubmit={handleRegisterSubmit} className="form">
              <div className="row">
                <div>
                  <label className="label">Jméno a příjmení</label>
                  <input className="input" name="name" type="text" placeholder="Jan Novák" required />
                </div>
                <div>
                  <label className="label">Email (povinný)</label>
                  <input className="input" name="email" type="email" placeholder="jan@domena.cz" required />
                </div>
              </div>
              <button className="submit" type="submit">Pokračovat</button>
              {message && <p className="note" style={{color: message.type === 'err' ? 'var(--error)' : 'var(--success)'}}>{message.text}</p>}
            </form>
          </section>
        )}

        {step === 'form' && selected && (
          <section style={{ marginTop: '48px' }}>
            <h2>Informace pro plán „{plans.find(p=>p.id===selected).title}“</h2>
            <form onSubmit={handleFullSubmit} className="form">
              <input type="hidden" name="plan" value={selected} />
              <div className="row">
                <div>
                  <label className="label">Výška (cm)</label>
                  <input className="input" name="height_cm" type="number" placeholder="180" />
                </div>
                <div>
                  <label className="label">Váha (kg)</label>
                  <input classclassName="input" name="weight_kg" type="number" placeholder="80" />
                </div>
              </div>
              {/* přidej další pole jako věk, aktivita, stres, cíl atd. */}
              <button className="submit" type="submit" disabled={loading}>
                {loading ? 'Odesílám…' : 'Dokončit registraci'}
              </button>
              {message && <p className="note" style={{color: message.type === 'err' ? 'var(--error)' : 'var(--success)'}}>{message.text}</p>}
            </form>
          </section>
        )}
      </main>
      <Footer />
    </>
  )
}
