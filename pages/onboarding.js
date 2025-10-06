// /pages/onboarding.js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'

// CZ → DB kódy
const MAPS = {
  activity: {
    'Sedavý':'sedavy','Mírně aktivní':'lehce','Středně aktivní':'stredne','Velmi aktivní':'velmi','Extra aktivní':'extra'
  },
  stress: { 'Nízká':'low','Střední':'medium','Vysoká':'high' },
  job: {
    'Kancelář / IT':'office_it','Řidič':'driver','Sklad':'warehouse','Manuální':'manual',
    'Zdravotnictví':'healthcare','Obchod / Učitel':'teacher_sales','Gastronomie':'gastronomy'
  },
  goal: { 'Redukce hmotnosti':'redukce','Nárůst svalů':'nabirani_svaly','Udržování':'udrzovani' },
  freq: { '0–1× týdně':'0-1','2–3× týdně':'2-3','4–5× týdně':'4plus' },
}

export default function Onboarding() {
  const router = useRouter()
  const { plan = '' } = router.query

  const [height, setHeight] = useState('180')
  const [weight, setWeight] = useState('80')
  const [age, setAge]       = useState('30')
  const [activity, setActivity] = useState('Středně aktivní')
  const [stress, setStress]     = useState('Střední')
  const [job, setJob]           = useState('Kancelář / IT')
  const [goal, setGoal]         = useState('Redukce hmotnosti')
  const [freq, setFreq]         = useState('2–3× týdně')

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { if (!plan) router.replace('/pricing') }, [plan, router])

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true); setMsg(null)

    const payload = {
      height_cm: Number(height||0),
      weight_kg: Number(weight||0),
      age: Number(age||0),
      activity:     MAPS.activity[activity] ?? 'stredne',
      stress_level: MAPS.stress[stress] ?? 'medium',
      occupation:   MAPS.job[job] ?? 'office_it',
      goal:         MAPS.goal[goal] ?? 'redukce',
      freq_choice:  MAPS.freq[freq] ?? '2-3',
      plan,
      lead_source: 'onboarding',
    }

    try {
      console.log('INSERT payload ->', payload)

      const { data, error } = await supabase
        .from('body_metrics')
        .insert([payload])
        .select('*')

      if (error) {
        const msg = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ')
        throw new Error(msg)
      }

      console.log('INSERT ok ->', data)
      setMsg({ type: 'ok', text: 'Hotovo! Data uložena.' })
      // router.push('/thankyou')
    } catch (err) {
      console.error('SUPABASE ERROR:', err)
      const text = err?.message || JSON.stringify(err, null, 2)
      setMsg({ type: 'err', text })
      // pro jistotu i alert (dočasně)
      alert(text)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="container">
        <h1>Detaily pro „{plan}“</h1>

        <form className="form" onSubmit={onSubmit}>
          <div className="row">
            <div>
              <label className="label">Výška (cm)</label>
              <input className="input" type="number" min="120" max="230"
                     value={height} onChange={e=>setHeight(e.target.value)} />
            </div>
            <div>
              <label className="label">Váha (kg)</label>
              <input className="input" type="number" min="35" max="250"
                     value={weight} onChange={e=>setWeight(e.target.value)} />
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Věk (roky)</label>
              <input className="input" type="number" min="10" max="100"
                     value={age} onChange={e=>setAge(e.target.value)} />
            </div>
            <div>
              <label className="label">Aktivita</label>
              <select className="select" value={activity} onChange={e=>setActivity(e.target.value)}>
                <option>Sedavý</option><option>Mírně aktivní</option><option>Středně aktivní</option>
                <option>Velmi aktivní</option><option>Extra aktivní</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Míra stresu</label>
              <select className="select" value={stress} onChange={e=>setStress(e.target.value)}>
                <option>Nízká</option><option>Střední</option><option>Vysoká</option>
              </select>
            </div>
            <div>
              <label className="label">Typ práce</label>
              <select className="select" value={job} onChange={e=>setJob(e.target.value)}>
                <option>Kancelář / IT</option><option>Řidič</option><option>Sklad</option>
                <option>Manuální</option><option>Zdravotnictví</option><option>Obchod / Učitel</option><option>Gastronomie</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Cíl</label>
              <select className="select" value={goal} onChange={e=>setGoal(e.target.value)}>
                <option>Redukce hmotnosti</option><option>Nárůst svalů</option><option>Udržování</option>
              </select>
            </div>
            <div>
              <label className="label">Frekvence cvičení</label>
              <select className="select" value={freq} onChange={e=>setFreq(e.target.value)}>
                <option>0–1× týdně</option><option>2–3× týdně</option><option>4–5× týdně</option>
              </select>
            </div>
          </div>

          <button className="submit" type="submit" disabled={loading}>
            {loading ? 'Ukládám…' : 'Dokončit registraci'}
          </button>

          {msg && (
            <p className="note" style={{ color: msg.type === 'ok' ? 'var(--success)' : 'var(--error)' }}>
              {msg.text}
            </p>
          )}
        </form>
      </main>
      <Footer />
    </>
  )
}
