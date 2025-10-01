// pages/index.js
import { useState } from 'react';

const occupations = [
  { value: 'office_it', label: 'Kancelář / IT' },
  { value: 'driver', label: 'Řidič' },
  { value: 'warehouse', label: 'Sklad' },
  { value: 'manual', label: 'Manuální práce' },
  { value: 'healthcare', label: 'Zdravotnictví' },
  { value: 'teacher_sales', label: 'Učitel / Obchod' },
  { value: 'gastronomy', label: 'Gastronomie' },
];

const activities = [
  { value: 'sedavy', label: 'Sedavý' },
  { value: 'lehce', label: 'Lehce aktivní' },
  { value: 'stredne', label: 'Středně aktivní' },
  { value: 'velmi', label: 'Velmi aktivní' },
  { value: 'extra', label: 'Extra aktivní' },
];

export default function Home() {
  const [form, setForm] = useState({
    email: '',
    name: '',
    gender: 'male',        // může být i 'muz/žena' – DB to normalizuje
    age: '',
    height_cm: '',
    weight_kg: '',
    activity: 'stredne',
    stress_level: 'medium',       // low | medium | high
    occupation: 'office_it',
    goal: 'redukce',              // redukce | udrzovani | nabirani_svaly
    freq_choice: '2-3',           // 0-1 | 2-3 | 4plus
  });
  const [status, setStatus] = useState(null);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus('Odesílám…');

    try {
      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error(await res.text());

      setStatus('Uloženo ✅ – plán přijde e-mailem');
      setForm((s) => ({ ...s, weight_kg: '' })); // drobný reset
    } catch (err) {
      setStatus('Chyba: ' + (err?.message || 'Neznámá chyba'));
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '0 auto' }}>
      <h1>Body & Mind ON</h1>
      <p>Formulář uloží data do tabulky <code>body_metrics</code> v Supabase.</p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <input name="email" placeholder="Email (povinný)" value={form.email} onChange={onChange} required />
        <input name="name" placeholder="Jméno a příjmení" value={form.name} onChange={onChange} />

        <label>Pohlaví:</label>
        <select name="gender" value={form.gender} onChange={onChange}>
          <option value="male">Muž</option>
          <option value="female">Žena</option>
        </select>

        <input name="age" placeholder="Věk (roky)" type="number" value={form.age} onChange={onChange} />
        <input name="height_cm" placeholder="Výška (cm)" type="number" value={form.height_cm} onChange={onChange} />
        <input name="weight_kg" placeholder="Váha (kg)" type="number" step="0.1" value={form.weight_kg} onChange={onChange} />

        <label>Aktivita:</label>
        <select name="activity" value={form.activity} onChange={onChange}>
          {activities.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>

        <label>Míra stresu:</label>
        <select name="stress_level" value={form.stress_level} onChange={onChange}>
          <option value="low">Nízká</option>
          <option value="medium">Střední</option>
          <option value="high">Vysoká</option>
        </select>

        <label>Typ práce:</label>
        <select name="occupation" value={form.occupation} onChange={onChange}>
          {occupations.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label>Cíl:</label>
        <select name="goal" value={form.goal} onChange={onChange}>
          <option value="redukce">Redukce hmotnosti</option>
          <option value="udrzovani">Udržování hmotnosti</option>
          <option value="nabirani_svaly">Nabírání svalové hmoty</option>
        </select>

        <label>Frekvence cvičení:</label>
        <select name="freq_choice" value={form.freq_choice} onChange={onChange}>
          <option value="0-1">0–1× týdně</option>
          <option value="2-3">2–3× týdně</option>
          <option value="4plus">4× a více</option>
        </select>

        <button type="submit">Uložit vstup</button>
      </form>

      {status && <p style={{ marginTop: 12 }}>{status}</p>}
    </div>
  );
}
