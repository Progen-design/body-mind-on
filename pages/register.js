// /pages/register.js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function Register() {
  const router = useRouter()
  const { plan } = router.query

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [activity, setActivity] = useState('stredne')
  const [stress, setStress] = useState('medium')
  const [occupation, setOccupation] = useState('office_it')
  const [goal, setGoal] = useState('redukce')
  const [freq, setFreq] = useState('2-3')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    // pokud někdo přijde rovnou sem bez výběru plánu
    if (!plan) router.replace('/pricing')
  }, [plan, router])

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true); setMsg(null)

    try {
      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          age: age ? Number(age) : null,
          height_cm: height ? Number(height) : null,
          weight_kg: weight ? Number(weight) : null,
          activity,               // ← kódy
          stress_level: stress,   // ← kódy
          occupation,             // ← kódy
          goal,                   // ← kódy
          freq_choice: freq,      // ← kódy
          notes
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Neznámá chyba')

      setMsg('Hotovo! Uloženo. Plán ti za chvíli pošleme na e-mail.')
      // volitelně redirect na onboarding
      // router.push('/onboarding')
    } catch (err) {
      setMsg(`Chyba: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="container">
        <h1>Detaily pro „Start“</h1>

        <form onSubmit={onSubmit}>
          <div className="grid">
            <div>
              <label>Výška (cm)</label>
              <input type="number" value={height} onChange={e=>setHeight(e.target.value)} placeholder="180" />
            </div>
            <div>
              <label>Váha (kg)</label>
              <input type="number" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="80" />
            </div>
            <div>
              <label>Věk (roky)</label>
              <input type="number" value={age} onChange={e=>setAge(e.target.value)} placeholder="30" />
            </div>
            <div>
              <label>Aktivita</label>
              <select value={activity} onChange={e=>setActivity(e.target.value)}>
                <option value="sedavy">Sedavý</option>
                <option value="lehce">Mírně aktivní</option>
                <option value="stredne">Středně aktivní</option>
                <option value="velmi">Vysoce aktivní</option>
                <option value="extra">Extra aktivní</option>
              </select>
            </div>
            <div>
              <label>Míra stresu</label>
              <select value={stress} onChange={e=>setStress(e.target.value)}>
                <option value="low">Nízká</option>
                <option value="medium">Střední</option>
                <option value="high">Vysoká</option>
              </select>
            </div>
            <div>
              <label>Typ práce</label>
              <select value={occupation} onChange={e=>setOccupation(e.target.value)}>
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
              <select value={goal} onChange={e=>setGoal(e.target.value)}>
                <option value="redukce">Redukce hmotnosti</option>
                <option value="udrzovani">Udržování</option>
                <option value="nabirani_svaly">Nabírání svalové hmoty</option>
              </select>
            </div>
            <div>
              <label>Frekvence cvičení</label>
              <select value={freq} onChange={e=>setFreq(e.target.value)}>
                <option value="0-1">0–1× týdně</option>
                <option value="2-3">2–3× týdně</option>
                <option value="4plus">4+ týdně</option>
              </select>
            </div>
            <div className="row single">
              <div>
                <label>Poznámky (volitelné)</label>
                <textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Zdravotní omezení, preference jídel apod."></textarea>
              </div>
            </div>
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Odesílám…' : 'Dokončit registraci'}
          </button>
          {msg && <p style={{marginTop:12}}>{msg}</p>}
        </form>
      </main>
      <Footer />

      <style jsx>{`
        .container { max-width: 980px; margin: 0 auto; padding: 24px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .row.single { grid-column: 1 / -1; }
        label { display:block; margin-bottom:6px; color:#bbb; }
        input, select, textarea {
          width: 100%; padding: 10px 12px; background:#111; color:#fff;
          border:1px solid #2a2a2a; border-radius:8px; outline: none;
        }
        .btn {
          width: 100%; margin-top: 16px; background: linear-gradient(90deg,#0ea5e9,#0284c7);
          color:#fff; padding: 14px 16px; border-radius:10px; border:none; cursor:pointer; font-weight:600;
        }
        .btn:disabled { opacity:.6; cursor:not-allowed; }
      `}</style>
    </>
  )
}
