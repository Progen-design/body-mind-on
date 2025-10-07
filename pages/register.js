// /pages/register.js
import { useState, useEffect } from 'react';
import Head from 'next/head';

const ACTIVITIES = [
  { value: 'sedavy', label: 'Sedavý' },
  { value: 'lehce', label: 'Mírně aktivní' },      // mapuje se na 'lehce'
  { value: 'stredne', label: 'Středně aktivní' },
  { value: 'velmi', label: 'Vysoce aktivní' },     // mapuje se na 'velmi'
  { value: 'extra', label: 'Extra aktivní' }
];

const STRESS = [
  { value: 'low', label: 'Nízká' },
  { value: 'medium', label: 'Střední' },
  { value: 'high', label: 'Vysoká' }
];

const OCCUPATIONS = [
  { value: 'office_it', label: 'Kancelář / IT' },
  { value: 'driver', label: 'Řidič' },
  { value: 'warehouse', label: 'Sklad / logistika' },
  { value: 'manual', label: 'Manuální práce' },
  { value: 'healthcare', label: 'Zdravotnictví' },
  { value: 'teacher_sales', label: 'Učitel / obchod' },
  { value: 'gastronomy', label: 'Gastronomie' }
];

const GOALS = [
  { value: 'redukce', label: 'Redukce hmotnosti' },
  { value: 'udrzovani', label: 'Udržování' },
  { value: 'nabirani_svaly', label: 'Nabírání svalové hmoty' }
];

const FREQ = [
  { value: '0-1', label: '0–1× týdně' },
  { value: '2-3', label: '2–3× týdně' },
  { value: '4plus', label: '4+ týdně' }
];

export default function Register() {
  // Můžeš si sem načíst name/email z předchozího kroku (localStorage, query, apod.)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const [height_cm, setHeight] = useState(180);
  const [weight_kg, setWeight] = useState(80);
  const [age, setAge] = useState(30);
  const [activity, setActivity] = useState('stredne');
  const [stress_level, setStress] = useState('medium');
  const [occupation, setOccupation] = useState('office_it');
  const [goal, setGoal] = useState('redukce');
  const [freq_choice, setFreq] = useState('2-3');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const r = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email,
          height_cm, weight_kg, age,
          activity, stress_level, occupation, goal, freq_choice,
          notes
        })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Neznámá chyba');

      setMsg('Hotovo! Plán ti pošleme e-mailem a zobrazí se i v appce.');
    } catch (err) {
      setMsg(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head><title>Registrace – Body & Mind ON</title></Head>
      <main className="container">
        <h2>Detaily pro „Start“</h2>
        <form onSubmit={onSubmit}>
          <div className="grid">
            <label>
              Výška (cm)
              <input type="number" value={height_cm} onChange={e=>setHeight(Number(e.target.value))} />
            </label>
            <label>
              Váha (kg)
              <input type="number" value={weight_kg} onChange={e=>setWeight(Number(e.target.value))} />
            </label>
            <label>
              Věk (roky)
              <input type="number" value={age} onChange={e=>setAge(Number(e.target.value))} />
            </label>
            <label>
              Aktivita
              <select value={activity} onChange={e=>setActivity(e.target.value)}>
                {ACTIVITIES.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              Míra stresu
              <select value={stress_level} onChange={e=>setStress(e.target.value)}>
                {STRESS.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              Typ práce
              <select value={occupation} onChange={e=>setOccupation(e.target.value)}>
                {OCCUPATIONS.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              Cíl
              <select value={goal} onChange={e=>setGoal(e.target.value)}>
                {GOALS.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              Frekvence cvičení
              <select value={freq_choice} onChange={e=>setFreq(e.target.value)}>
                {FREQ.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="col-span-2">
              Poznámky (volitelné)
              <textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Zranění, omezení, preference…"/>
            </label>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Odesílám…' : 'Dokončit registraci'}
          </button>

          {msg && <p style={{marginTop:12, color: msg.startsWith('Hotovo') ? '#22c55e' : '#ef4444'}}>{msg}</p>}
        </form>

        <style jsx>{`
          .container{max-width:960px;margin:0 auto;padding:24px}
          .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
          label{display:flex;flex-direction:column;gap:8px}
          .col-span-2{grid-column:span 2}
          input,select,textarea{background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:10px}
          button{margin-top:16px;width:100%;padding:14px;border-radius:10px;background:linear-gradient(90deg,#0ea5e9,#0284c7);color:#fff;font-weight:600}
          button:disabled{opacity:.6}
        `}</style>
      </main>
    </>
  );
}
