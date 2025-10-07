// /pages/pricing.js
import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function PricingPage() {
  // volitelné identifikační údaje (pomáhají svázat měření s člověkem)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  // vstupy do body_metrics (odesíláme přímo kódy tak, jak je chce DB)
  const [height, setHeight] = useState('')                 // cm
  const [weight, setWeight] = useState('')                 // kg
  const [age, setAge] = useState('')                       // roky

  const [activity, setActivity] = useState('stredne')      // 'sedavy' | 'lehce' | 'stredne' | 'velmi' | 'extra'
  const [stress, setStress] = useState('medium')           // 'low' | 'medium' | 'high'
  const [occupation, setOccupation] = useState('office_it')// 'office_it' | 'driver' | 'warehouse' | 'manual' | 'healthcare' | 'teacher_sales' | 'gastronomy'
  const [goal, setGoal] = useState('redukce')              // 'redukce' | 'udrzovani' | 'nabirani_svaly'
  const [freq, setFreq] = useState('2-3')                  // '0-1' | '2-3' | '4plus'

  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  function numOrNull(v) {
    if (v === '' || v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)

    // jednoduchá FE validace (ať uživatel ví proč to nejde odeslat)
    const h = numOrNull(height)
    const w = numOrNull(weight)
    const a = numOrNull(age)
    if (h !== null && h <= 0) return (setLoading(false), setMsg('Výška musí být kladné číslo'))
    if (w !== null && w <= 0) return (setLoading(false), setMsg('Váha musí být kladné číslo'))
    if (a !== null && a <= 0) return (setLoading(false), setMsg('Věk musí být kladné číslo'))

    const payload = {
      // volitelné – pokud je dáš, bude se plán vázat k tomuto e-mailu
      name: name || null,
      email: email || null,

      // vstupy přehledně 1:1 k DB
      age: a,
      height_cm: h,
      weight_kg: w,
      activity,
      stress_level: stress,
      occupation,
      goal,
      freq_choice: freq,
      notes: notes || null
    }

    try {
      console.log('[pricing] POST /api/body-metrics payload:', payload)
      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      // backend vrací JSON
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('[pricing] /api/body-metrics error:', data)
        throw new Error(data?.error || `Chyba ${res.status}`)
      }

      console.log('[pricing] /api/body-metrics OK:', data)
      setMsg('Hotovo! Údaje byly uloženy. Pokud jsi vyplnil/a e-mail, za chvíli dorazí jídelníček a trénink.')
    } catch (err) {
      console.error(err)
      setMsg(`Chyba: ${err.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />

      {/* ⬇ sem nech klidně svoje karty/ceník – nic není potřeba měnit */}
      <main className="container">
        <h2>Detaily pro „Start“</h2>

        <form onSubmit={onSubmit} className="form">
          {/* identifikace (volitelné, ale doporučené) */}
          <div className="grid">
            <div>
              <label>Jméno (volitelné)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jan Novák"
                autoComplete="name"
              />
            </div>
            <div>
              <label>E-mail (pro odeslání plánu)</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jan@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          {/* tělesné parametry */}
          <div className="grid">
            <div>
              <label>Výška (cm)</label>
              <input
                type="number"
                inputMode="numeric"
                value={height}
                onChange={e => setHeight(e.target.value)}
                placeholder="190"
              />
            </div>
            <div>
              <label>Váha (kg)</label>
              <input
                type="number"
                inputMode="numeric"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="90"
              />
            </div>

            <div>
              <label>Věk (roky)</label>
              <input
                type="number"
                inputMode="numeric"
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="35"
              />
            </div>
          </div>

          {/* životní styl / cíle */}
          <div className="grid">
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
                <option value="warehouse">Sklad / Logistika</option>
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
          </div>

          {/* poznámka */}
          <div className="single">
            <label>Poznámky (volitelné)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Zdravotní omezení, preference jídel, vybavení do posilovny…"
            />
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Odesílám…' : 'Dokončit registraci'}
          </button>

          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>
      </main>

      <Footer />

      <style jsx>{`
        .container { max-width: 980px; margin: 32px auto; padding: 0 16px; }
        .form { margin-top: 18px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .single { margin-top: 8px; }
        label { display:block; margin-bottom:6px; color:#bbb; font-size:14px; }
        input, select, textarea {
          width:100%; padding:10px 12px; background:#101114; color:#fff;
          border:1px solid #23252b; border-radius:10px; outline:none;
        }
        input:focus, select:focus, textarea:focus { border-color:#0ea5e9; }
        .btn {
          width:100%; margin-top:18px;
          background:linear-gradient(90deg,#0ea5e9,#0284c7);
          color:#fff; padding:14px 16px; border-radius:12px; border:none;
          font-weight:700; letter-spacing:.2px;
        }
        .btn[disabled] { opacity:.7; cursor:not-allowed; }
      `}</style>
    </>
  )
}
