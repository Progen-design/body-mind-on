// /pages/register.js
import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function Register() {
  // povinné vstupy
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState('male')        // 'male' | 'female'
  const [age, setAge] = useState('')                 // číslo
  const [height, setHeight] = useState('')           // cm (číslo)
  const [weight, setWeight] = useState('')           // kg (číslo)

  // další vstupy podle schématu
  const [activity, setActivity] = useState('stredne')        // sedavy|lehce|stredne|velmi|extra
  const [stressLevel, setStressLevel] = useState('medium')   // low|medium|high
  const [occupation, setOccupation] = useState('office_it')  // office_it|driver|warehouse|manual|healthcare|teacher_sales|gastronomy
  const [goal, setGoal] = useState('redukce')                // redukce|udrzovani|nabirani_svaly
  const [freqChoice, setFreqChoice] = useState('2-3')        // 0-1|2-3|4plus
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setMsg(null)

    // odesíláme přes /api/body-metrics (server vloží do Supabase + pošle do Make)
    try {
      const payload = {
        name,
        email,
        gender,                       // 'male' | 'female'
        age,                          // číslo jako string; server si převede
        height_cm: height,            // číslo
        weight_kg: weight,            // číslo
        activity,                     // kód z výčtu
        stress_level: stressLevel,    // kód z výčtu
        occupation,                   // kód z výčtu
        goal,                         // kód z výčtu
        freq_choice: freqChoice,      // kód z výčtu
        notes
      }

      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Unknown error')

      setMsg('Úspěšně odesláno ✅')
      // volitelně: vyčistit formulář
      // resetFields()
    } catch (err) {
      console.error('[register] submit error:', err)
      setMsg('Chyba při odeslání ❌: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const input = (props) => (
    <input className="bm-input" {...props} />
  )
  const select = (props) => (
    <select className="bm-input" {...props} />
  )
  const label = (children) => (
    <label className="bm-label">{children}</label>
  )

  return (
    <>
      <Header />
      <main className="container" style={{maxWidth: 820, margin: '40px auto', padding: '0 16px'}}>
        <h1 style={{marginBottom: 12}}>Detaily pro „Start“</h1>
        <form onSubmit={onSubmit} style={{display: 'grid', gap: 16}}>
          {/* Základní identifikace */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
            <div>
              {label('Jméno')}
              {input({placeholder:'Jan Novák', value:name, onChange:e=>setName(e.target.value), required:true})}
            </div>
            <div>
              {label('E-mail')}
              {input({type:'email', placeholder:'jan@example.com', value:email, onChange:e=>setEmail(e.target.value), required:true})}
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16}}>
            <div>
              {label('Pohlaví')}
              {select({value:gender, onChange:e=>setGender(e.target.value), required:true, children:(
                <>
                  <option value="male">Muž</option>
                  <option value="female">Žena</option>
                </>
              )})}
            </div>
            <div>
              {label('Věk (roky)')}
              {input({type:'number', min:10, max:100, placeholder:'35', value:age, onChange:e=>setAge(e.target.value), required:true})}
            </div>
            <div>
              {label('Výška (cm)')}
              {input({type:'number', min:100, max:240, placeholder:'180', value:height, onChange:e=>setHeight(e.target.value), required:true})}
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
            <div>
              {label('Váha (kg)')}
              {input({type:'number', min:30, max:250, placeholder:'82', value:weight, onChange:e=>setWeight(e.target.value), required:true})}
            </div>
            <div>
              {label('Aktivita')}
              {select({value:activity, onChange:e=>setActivity(e.target.value), children:(
                <>
                  <option value="sedavy">Sedavý režim</option>
                  <option value="lehce">Lehce aktivní</option>
                  <option value="stredne">Středně aktivní</option>
                  <option value="velmi">Velmi aktivní</option>
                  <option value="extra">Extra aktivní</option>
                </>
              )})}
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
            <div>
              {label('Míra stresu')}
              {select({value:stressLevel, onChange:e=>setStressLevel(e.target.value), children:(
                <>
                  <option value="low">Nízká</option>
                  <option value="medium">Střední</option>
                  <option value="high">Vysoká</option>
                </>
              )})}
            </div>
            <div>
              {label('Typ práce')}
              {select({value:occupation, onChange:e=>setOccupation(e.target.value), children:(
                <>
                  <option value="office_it">Kancelář / IT</option>
                  <option value="driver">Řidič</option>
                  <option value="warehouse">Sklad / logistika</option>
                  <option value="manual">Manuální práce</option>
                  <option value="healthcare">Zdravotnictví</option>
                  <option value="teacher_sales">Učitel / Obchod</option>
                  <option value="gastronomy">Gastronomie</option>
                </>
              )})}
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
            <div>
              {label('Cíl')}
              {select({value:goal, onChange:e=>setGoal(e.target.value), children:(
                <>
                  <option value="redukce">Redukce hmotnosti</option>
                  <option value="udrzovani">Udržování</option>
                  <option value="nabirani_svaly">Nabírání svalové hmoty</option>
                </>
              )})}
            </div>
            <div>
              {label('Frekvence cvičení')}
              {select({value:freqChoice, onChange:e=>setFreqChoice(e.target.value), children:(
                <>
                  <option value="0-1">0–1× týdně</option>
                  <option value="2-3">2–3× týdně</option>
                  <option value="4plus">4+ týdně</option>
                </>
              )})}
            </div>
          </div>

          <div>
            {label('Poznámky')}
            <textarea
              className="bm-input"
              placeholder="Zdravotní omezení, preference jídel, vybavení doma..."
              rows={4}
              value={notes}
              onChange={e=>setNotes(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className="bm-btn">
            {loading ? 'Odesílám…' : 'Dokončit registraci'}
          </button>

          {msg && <p style={{color: msg.includes('✅') ? '#2ecc71' : '#e74c3c'}}>{msg}</p>}
        </form>
      </main>
      <Footer />

      {/* jednoduché styly pro vstupy, ať to vypadá slušně i bez Tailwindu */}
      <style jsx>{`
        .bm-input {
          width: 100%;
          padding: 10px 12px;
          background: #121212;
          border: 1px solid #2a2a2a;
          color: #fff;
          border-radius: 8px;
        }
        .bm-label {
          display: block;
          color: #bbb;
          font-size: 14px;
          margin-bottom: 6px;
        }
        .bm-btn {
          padding: 12px 18px;
          background: #1e90ff;
          color: #fff;
          border: 0;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }
        .bm-btn:disabled { opacity: .7; cursor: default; }
      `}</style>
    </>
  )
}
