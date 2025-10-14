// /pages/pricing.js
import { useEffect, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function PricingPage() {
  // kontrolní flag
  useEffect(() => { window.__BMON_FORM_V2 = true }, [])

  // Required / optional fields tak, jak je máme v DB
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const [gender, setGender] = useState('male')            // 'male' | 'female'
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')

  const [activity, setActivity] = useState('stredne')     // 'sedavy' | 'lehce' | 'stredne' | 'velmi' | 'extra'
  const [stress, setStress] = useState('medium')          // 'low' | 'medium' | 'high'
  const [occupation, setOccupation] = useState('office_it') // 'office_it'|'driver'|'warehouse'|'manual'|'healthcare'|'teacher_sales'|'gastronomy'
  const [goal, setGoal] = useState('redukce')             // 'redukce' | 'udrzovani' | 'nabirani_svaly'
  const [freq, setFreq] = useState('2-3')                 // '0-1' | '2-3' | '4plus'
  const [weeklyUser, setWeeklyUser] = useState('')        // číslo 1/3/5 (volitelné)

  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)

    try {
      const payload = {
        user_id: null,
        email: email || null,
        name: name || null,
        gender,
        age: age ? Number(age) : null,
        height_cm: height ? Number(height) : null,
        weight_kg: weight ? Number(weight) : null,
        activity,
        stress_level: stress,
        occupation,
        goal,
        freq_choice: freq,
        weekly_sessions_user: weeklyUser ? Number(weeklyUser) : null,
        notes: notes || null
      }

      // 1️⃣ Uložení metrik do Supabase
      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

      setMsg('Hotovo! Údaje jsou uložené. Pokud je e-mail vyplněn, plán se začne generovat.')

      // 2️⃣ Spuštění generátoru plánu
      if (email) {
        try {
          const gen = await fetch('/api/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          })

          if (!gen.ok) {
            const err = await gen.text()
            console.error('❌ Plan generation failed:', err)
          } else {
            console.log('✅ Plán byl úspěšně generován.')
          }
        } catch (e) {
          console.error('❌ Chyba při volání /api/generate-plan:', e)
        }
      } else {
        console.warn('⚠️ E-mail nebyl vyplněn, plán se negeneruje.')
      }

    } catch (err) {
      setMsg(`Chyba: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />

      <section className="container">
        <h2>Detaily pro „Start“</h2>

        <form onSubmit={onSubmit}>
          <div className="grid">
            <div className="full">
              <label>Jméno a příjmení (volitelné)</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Jan Test" />
            </div>

            <div className="full">
              <label>E-mail (doporučeno pro doručení plánu)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@example.com" />
            </div>

            <div>
              <label>Pohlaví</label>
              <select value={gender} onChange={e => setGender(e.target.value)}>
                <option value="male">Muž</option>
                <option value="female">Žena</option>
              </select>
            </div>

            <div>
              <label>Věk (roky)</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="35" />
            </div>

            <div>
              <label>Výška (cm)</label>
              <input type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="180" />
            </div>

            <div>
              <label>Váha (kg)</label>
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="80" />
            </div>

            <div>
              <label>Aktivita</label>
              <select value={activity} onChange={e => setActivity(e.target.value)}>
                <option value="sedavy">Sedavý</option>
                <option value="lehce">Mírně aktivní</option>
                <option value="stredne">Středně aktivní</option>
                <option value="velmi">Vysoce aktivní</option>
                <option value="extra">Extra aktivní</option>
              </select>
            </div>

            <div>
              <label>Míra stresu</label>
              <select value={stress} onChange={e => setStress(e.target.value)}>
                <option value="low">Nízká</option>
                <option value="medium">Střední</option>
                <option value="high">Vysoká</option>
              </select>
            </div>

            <div>
              <label>Typ práce</label>
              <select value={occupation} onChange={e => setOccupation(e.target.value)}>
                <option value="office_it">Kancelář / IT</option>
                <option value="driver">Řidič / Kurýr</option>
                <option value="warehouse">Sklad / Logistika (směnný provoz)</option>
                <option value="manual">Manuální</option>
                <option value="healthcare">Zdravotnictví</option>
                <option value="teacher_sales">Učitel / Obchod</option>
                <option value="gastronomy">Gastronomie</option>
              </select>
            </div>

            <div>
              <label>Cíl</label>
              <select value={goal} onChange={e => setGoal(e.target.value)}>
                <option value="redukce">Redukce hmotnosti</option>
                <option value="udrzovani">Udržování</option>
                <option value="nabirani_svaly">Nabírání svalů</option>
              </select>
            </div>

            <div>
              <label>Frekvence cvičení</label>
              <select value={freq} onChange={e => setFreq(e.target.value)}>
                <option value="0-1">0–1× týdně</option>
                <option value="2-3">2–3× týdně</option>
                <option value="4plus">4+ týdně</option>
              </select>
            </div>

            <div>
              <label>Tvoje volba frekvence (1 / 3 / 5 – volitelné)</label>
              <input type="number" value={weeklyUser} onChange={e => setWeeklyUser(e.target.value)} placeholder="3" />
            </div>

            <div className="full">
              <label>Poznámky (volitelné)</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Zdravotní omezení, preference jídel…" />
            </div>
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Odesílám…' : 'Dokončit registraci'}
          </button>
          {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
        </form>
      </section>

      <Footer />

      <style jsx>{`
        .container { max-width: 980px; margin: 32px auto; padding: 0 16px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .full { grid-column: 1 / -1; }
        label { display:block; margin-bottom:6px; color:#bbb; }
        input, select, textarea {
          width:100%; padding:10px 12px; background:#111; color:#fff;
          border:1px solid #2a2a2a; border-radius:8px; outline:none;
        }
        .btn {
          width:100%; margin-top:16px;
          background:linear-gradient(90deg,#0ea5e9,#0284c7);
          color:#fff; padding:14px 16px; border-radius:10px; border:none; font-weight:600;
        }
      `}</style>
    </>
  )
}
