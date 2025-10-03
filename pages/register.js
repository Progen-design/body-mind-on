// /pages/register.js
import { useRouter } from 'next/router'
import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function Register() {
  const router = useRouter()
  const { plan } = router.query

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [activity, setActivity] = useState('')
  const [stress, setStress] = useState('')
  const [occupation, setOccupation] = useState('')
  const [goal, setGoal] = useState('')
  const [freq, setFreq] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setMsg(null)

    try {
      const payload = {
        name,
        email,
        gender,
        age,
        height_cm: height,
        weight_kg: weight,
        activity,
        stress_level: stress,
        occupation,
        goal,
        freq_choice: freq,
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
    } catch (err) {
      console.error('[register] submit error:', err)
      setMsg('Chyba při odeslání ❌: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="container">
        <h1>Registrace</h1>
        <form onSubmit={onSubmit}>
          <input placeholder="Jméno" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Pohlaví" value={gender} onChange={(e) => setGender(e.target.value)} />
          <input type="number" placeholder="Věk" value={age} onChange={(e) => setAge(e.target.value)} />
          <input type="number" placeholder="Výška (cm)" value={height} onChange={(e) => setHeight(e.target.value)} />
          <input type="number" placeholder="Váha (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <input placeholder="Aktivita" value={activity} onChange={(e) => setActivity(e.target.value)} />
          <input placeholder="Stres" value={stress} onChange={(e) => setStress(e.target.value)} />
          <input placeholder="Povolání" value={occupation} onChange={(e) => setOccupation(e.target.value)} />
          <input placeholder="Cíl" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <input placeholder="Frekvence" value={freq} onChange={(e) => setFreq(e.target.value)} />
          <textarea placeholder="Poznámky" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="submit" disabled={loading}>
            {loading ? 'Odesílám…' : 'Odeslat'}
          </button>
        </form>
        {msg && <p>{msg}</p>}
      </main>
      <Footer />
    </>
  )
}
