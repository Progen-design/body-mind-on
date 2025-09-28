'use client';

import { useState } from 'react';

export default function Home() {
  const [form, setForm] = useState({
    name: '',
    age: '',
    height_cm: '',
    weight_kg: '',
    body_fat_pct: '',
    water_pct: ''
  });
  const [status, setStatus] = useState(null);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus('Odesílám…');

    try {
      const res = await fetch('/api/clients', {
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
        name: '',
        age: '',
        height_cm: '',
        weight_kg: '',
        body_fat_pct: '',
        water_pct: ''
      });
    } catch (err) {
      setStatus('Chyba: ' + err.message);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1>Body & Mind ON</h1>
      <p>Minimální Next.js app je nasazená. Níže je testovací formulář na uložení klienta do Supabase.</p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <input name="name" placeholder="Jméno a příjmení" value={form.name} onChange={onChange} required />
        <input name="age" placeholder="Věk (roky)" type="number" value={form.age} onChange={onChange} />
        <input name="height_cm" placeholder="Výška (cm)" type="number" value={form.height_cm} onChange={onChange} />
        <input name="weight_kg" placeholder="Váha (kg)" type="number" step="0.1" value={form.weight_kg} onChange={onChange} />
        <input name="body_fat_pct" placeholder="% tuku" type="number" step="0.1" value={form.body_fat_pct} onChange={onChange} />
        <input name="water_pct" placeholder="Voda v těle (%)" type="number" step="0.1" value={form.water_pct} onChange={onChange} />

        <button type="submit">Uložit klienta</button>
      </form>

      {status && <p style={{ marginTop: 12 }}>{status}</p>}
    </main>
  );
}
