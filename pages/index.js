import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

const plans = [
  { id: 'start', title: 'Start', price: 'ZDARMA', perks: ['1× ukázkový jídelníček + 1× trénink', 'Evidence váhy a měření', 'Základní tipy e-mailem'] },
  { id: 'individual', title: 'Individuální', price: '1 490 Kč / měsíc', perks: ['Plán na míru bez trenéra', 'AI jídelníček + trénink každý týden', 'Automatické úpravy podle výsledků', 'Tipy pro spánek, stres, regeneraci'], recommended: true },
  { id: 'group', title: 'Skupina', price: '2 490 Kč / měsíc', perks: ['Vše z balíčku Individuální', '1× skupinový trénink měsíčně', 'Přístup do komunity', 'Q&A s koučem 1× za měsíc'] },
  { id: 'addon', title: 'Add-on: Osobní lekce', price: '60 min = 1 190 Kč / 90 min = 1 690 Kč', perks: ['Doobjednej kdykoliv', 'Balíčky (5×, 10×) – sleva', 'Storno do 24 h zdarma'] }
]

export default function Home() {
  const [selected, setSelected] = useState(null)
  const [step, setStep] = useState('choosePlan')
  const [regData, setRegData] = useState({ name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  function handleSelectPlan(planId) {
    setSelected(planId)
    setStep('register')
  }

  function handleRegisterSubmit(e) {
    e.preventDefault()
    const name = e.target.name.value.trim()
    const email = e.target.email.value.trim()
    if (!name || !email) {
      setMessage({ type: 'err', text: 'Vyplň jméno i e-mail.' })
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
      ...(selected !== 'addon' && {
        gender: form.get('gender'),
        age: Number(form.get('age') || 0),
        height_cm: Number(form.get('height_cm') || 0),
        weight_kg: Number(form.get('weight_kg') || 0),
        activity: form.get('activity'),
        stress: form.get('stress'),
        job: form.get('job'),
        goal: form.get('goal'),
        weekly_sessions: form.get('weekly_sessions'),
      }),
      ...(selected === 'addon' && {
        lesson_type: form.get('lesson_type'),
        duration: form.get('duration'),
      })
    }

    try {
      // TODO: supabase insert payload
      await new Promise(r => setTimeout(r, 600))
      setMessage({ type: 'ok', text: 'Registrace dokončena!' })
      e.currentTarget.reset()
      setSelected(null)
      setStep('choosePlan')
    } catch (err) {
      setMessage({ type: 'err', text: 'Chyba – zkus to znovu.' })
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

        <section className="pricing-section">
          <h2>Ceník</h2>
          <p className="subtext">Vyber plán, který ti vyhovuje. Add-ony lze dokoupit později.</p>
          <div className="pricing-grid">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`card ${selected === plan.id ? 'selected' : ''}`}
                onClick={() => handleSelectPlan(plan.id)}
              >
                {plan.recommended && <div className="badge">Doporučeno</div>}
                <h3>{plan.title}</h3>
                <p className="price">{plan.price}</p>
                <ul className="perks">{plan.perks.map((p,i) => <li key={i}>{p}</li>)}</ul>
                <button className="submit" disabled={selected === plan.id && step === 'register'}>
                  {selected === plan.id ? 'Vybráno' : 'Zvolit'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {step === 'register' && selected && (
          <section className="form-section">
            <h2>Registrace pro plán „{plans.find(p => p.id === selected).title}“</h2>
            <form onSubmit={handleRegisterSubmit} className="form">
              <div className="row">
                <div>
                  <label className="label">Jméno a příjmení</label>
                  <input className="input" name="name" type="text" placeholder="Jan Novák" required />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" name="email" type="email" placeholder="jan@domena.cz" required />
                </div>
              </div>
              <button className="submit" type="submit">Pokračovat</button>
              {message && <p className="note" style={{ color: message.type === 'err' ? 'var(--error)' : 'var(--success)' }}>{message.text}</p>}
            </form>
          </section>
        )}

        {step === 'form' && selected && (
          <section className="form-section">
            <h2>Detaily pro „{plans.find(p => p.id === selected).title}“</h2>
            <form onSubmit={handleFullSubmit} className="form">
              <input type="hidden" name="plan" value={selected} />
              {selected === 'addon' ? (
                <>
                  <div className="row">
                    <div>
                      <label className="label">Typ lekce</label>
                      <select className="select" name="lesson_type">
                        <option>Osobní trénink</option>
                        <option>Online lekce</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Délka (min)</label>
                      <select className="select" name="duration" defaultValue="60">
                        <option value="60">60</option>
                        <option value="90">90</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="row">
                    <div>
                      <label className="label">Výška (cm)</label>
                      <input className="input" name="height_cm" type="number" placeholder="180" />
                    </div>
                    <div>
                      <label className="label">Váha (kg)</label>
                      <input className="input" name="weight_kg" type="number" placeholder="80" />
                    </div>
                  </div>
                  <div className="row">
                    <div>
                      <label className="label">Věk (roky)</label>
                      <input className="input" name="age" type="number" min="10" max="100" placeholder="30" />
                    </div>
                    <div>
                      <label className="label">Aktivita</label>
                      <select className="select" name="activity" defaultValue="Středně aktivní">
                        <option>Mírně aktivní</option>
                        <option>Středně aktivní</option>
                        <option>Vysoce aktivní</option>
                      </select>
                    </div>
                  </div>
                  <div className="row">
                    <div>
                      <label className="label">Míra stresu</label>
                      <select className="select" name="stress" defaultValue="Střední">
                        <option>Nízká</option>
                        <option>Střední</option>
                        <option>Vysoká</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Typ práce</label>
                      <select className="select" name="job" defaultValue="Kancelář / IT">
                        <option>Kancelář / IT</option>
                        <option>Manuální</option>
                        <option>Směnný provoz</option>
                      </select>
                    </div>
                  </div>
                  <div className="row">
                    <div>
                      <label className="label">Cíl</label>
                      <select className="select" name="goal" defaultValue="Redukce hmotnosti">
                        <option>Redukce hmotnosti</option>
                        <option>Nárůst svalů</option>
                        <option>Udržení</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Frekvence cvičení</label>
                      <select className="select" name="weekly_sessions" defaultValue="2–3× týdně">
                        <option>1× týdně</option>
                        <option>2–3× týdně</option>
                        <option>4–5× týdně</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
              <button className="submit" type="submit" disabled={loading}>
                {loading ? 'Odesílám…' : 'Dokončit registraci'}
              </button>
              {message && <p className="note" style={{ color: message.type === 'err' ? 'var(--error)' : 'var(--success)' }}>{message.text}</p>}
            </form>
          </section>
        )}
      </main>
      <Footer />
    </>
  )
}
