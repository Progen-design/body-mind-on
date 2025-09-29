import { useState } from 'react';

export default function Home() {
  const [form, setForm] = useState({
    email: '',
    name: '',
    gender: 'male',
    age: '',
    height_cm: '',
    weight_kg: '',
    body_fat_percentage: '',
    water_percentage: '',
    activity_level: 'moderately_active'
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
        body: JSON.stringify(form)
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Neznámá chyba');
      }

      setStatus('Uloženo ✅');
      setForm({
        email: '',
        name: '',
        gender: 'male',
        age: '',
        height_cm: '',
        weight_kg: '',
        body_fat_percentage: '',
        water_percentage: '',
        activity_level: 'moderately_active'
      });
    } catch (err) {
      setStatus('Chyba: ' + err.message);
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
        <input name="body_fat_percentage" placeholder="% tuku" type="number" step="0.1" value={form.body_fat_percentage} onChange={onChange} />
        <input name="water_percentage" placeholder="Voda v těle (%)" type="number" step="0.1" value={form.water_percentage} onChange={onChange} />
        <label>Aktivita:</label>
        <select name="activity_level" value={form.activity_level} onChange={onChange}>
          <option value="sedentary">Sedavý</option>
          <option value="lightly_active">Lehce aktivní</option>
          <option value="moderately_active">Středně aktivní</option>
          <option value="very_active">Velmi aktivní</option>
          <option value="extremely_active">Extrémně aktivní</option>
        </select>

        <button type="submit">Uložit měření</button>
      </form>

      {status && <p style={{ marginTop: 12 }}>{status}</p>}
    </div>
  );
}
