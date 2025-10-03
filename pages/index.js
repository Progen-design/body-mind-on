// pages/index.js
import { useState } from 'react'

export default function Home(){
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function onSubmit(e){
    e.preventDefault()
    setLoading(true); setMessage(null)

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
      weekly_sessions: form.get('weekly_sessions') || '2–3× týdně'
    }

    try {
      // TODO: TADY vlož tvůj existující kód, který ukládá do Supabase:
      // např. const { error } = await supabase.from('body_metrics').insert(payload)

      // Demo: simuluji OK
      await new Promise(r=>setTimeout(r,800))
      setMessage({type:'ok', text:'Uloženo. Mrkni do aplikace – čeká tě plán!'})
      e.currentTarget.reset()
    } catch (err){
      setMessage({type:'err', text:'Něco se nepovedlo. Zkus to znovu.'})
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div>
          <h1>Body & Mind ON</h1>
          <p>Kompletní systém pro <strong>silné tělo</strong>, více energie a pevné sebevědomí.
            Nejde jen o trénink nebo jídelníček – <strong>AI asistent</strong> ti spojí jídlo, pohyb a mindset
            do <strong>jednoduchých kroků</strong>.</p>
          <div className="cta">
            <a className="btn" href="/#start">Začít zdarma</a>
            <a className="ghost" href="https://bodyandmindon.cz">Zpět na web</a>
          </div>
        </div>
        <div className="card">
          <h2>Co získáš</h2>
          <ul style={{margin:'8px 0 0 18px',color:'var(--muted)'}}>
            <li>Osobní kalorický cíl a makra</li>
            <li>Týdenní plán jídla i tréninku</li>
            <li>Jednoduché úkoly pro návyk</li>
          </ul>
        </div>
      </section>

      {/* FORM */}
      <section id="start" className="card" style={{marginTop:18}}>
        <h2>Rychlý start</h2>
        <p className="note">Formulář uloží data do tabulky <code>body_metrics</code> v Supabase.</p>

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
            {loading ? 'Ukládám…' : 'Začít moji cestu'}
          </button>
          {message && (
            <p className="note" style={{color: message.type==='ok'?'var(--success)':'var(--error)'}}>
              {message.text}
            </p>
          )}
        </form>
      </section>
    </>
  )
}
