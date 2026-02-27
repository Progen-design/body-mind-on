import React from 'react';
import { supabaseServer } from '../lib/supabaseServer';

export async function getServerSideProps({ query }) {
  // jednoduché zabezpečení: /admin?key=TVŮJ_TOKEN
  const key = query.key || '';
  if (!process.env.ADMIN_TOKEN || key !== process.env.ADMIN_TOKEN) {
    return { notFound: true };
  }

  const { data, error } = await supabaseServer
    .from('body_metrics')
    .select('id, created_at, user_id, email, name, gender, age, height_cm, weight_kg, body_fat_percentage, water_percentage, bmi, tdee')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return { props: { rows: [], err: error.message, adminKey: key } };
  }
  return { props: { rows: data, err: null, adminKey: key } };
}

export default function Admin({ rows, err, adminKey }) {
  const [calendarForm, setCalendarForm] = React.useState({
    date: new Date().toISOString().slice(0, 10),
    time: '10:00',
    title: 'Trénink',
    userEmails: '',
    durationMin: 60,
  });
  const [calendarSubmit, setCalendarSubmit] = React.useState({ loading: false, message: '' });

  const handleCalendarSubmit = async (e) => {
    e.preventDefault();
    if (!adminKey) return;
    setCalendarSubmit({ loading: true, message: '' });
    try {
      const res = await fetch('/api/calendar/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: adminKey,
          date: calendarForm.date,
          time: calendarForm.time,
          title: calendarForm.title || 'Trénink',
          userEmails: calendarForm.userEmails ? calendarForm.userEmails.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean) : [],
          durationMin: calendarForm.durationMin || 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba');
      setCalendarSubmit({ loading: false, message: data.message || 'Trénink přidán.' });
      setCalendarForm((f) => ({ ...f, title: 'Trénink', userEmails: '' }));
    } catch (err) {
      setCalendarSubmit({ loading: false, message: err.message || 'Nepodařilo se přidat.' });
    }
  };

  if (err) return <pre style={{ padding: 24, color: 'crimson' }}>{err}</pre>;

  const downloadCSV = () => {
    const header = [
      'id','created_at','user_id','email','name','gender','age','height_cm',
      'weight_kg','body_fat_percentage','water_percentage','bmi','tdee'
    ];
    const escape = (v) => {
      const s = v == null ? '' : String(v);
      return `"${s.replaceAll('"','""')}"`;
    };
    const lines = [
      header.join(','),
      ...rows.map(r => header.map(h => escape(r[h])).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'body_metrics.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Admin – Body &amp; Mind ON</h1>

      <section style={{ marginBottom: 32, padding: 20, background: '#f5f5f5', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Kalendář trenéra</h2>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 12 }}>
          Pro zápis tréninků z této stránky musí být kalendář propojen s účtem info@. Jednou propoj:{' '}
          <a href={adminKey ? `/api/auth/google-calendar/connect?key=${encodeURIComponent(adminKey)}` : '#'} style={{ fontWeight: 600 }}>
            Propojit Google Kalendář (info@)
          </a>
        </p>
        <h3 style={{ marginTop: 16, marginBottom: 8 }}>Přidat trénink do kalendáře</h3>
        <p style={{ color: '#666', fontSize: 14 }}>Událost se zapíše do Google Kalendáře trenéra (info@). Uživatelé ji uvidí v sekci „Kdy mám trénink?“ na profilu. Pro přiřazení konkrétním klientům vyplň e-maily.</p>
        <form onSubmit={handleCalendarSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
          <label>
            Datum <input type="date" value={calendarForm.date} onChange={(e) => setCalendarForm((f) => ({ ...f, date: e.target.value }))} required style={{ marginLeft: 8 }} />
          </label>
          <label>
            Čas <input type="time" value={calendarForm.time} onChange={(e) => setCalendarForm((f) => ({ ...f, time: e.target.value }))} required style={{ marginLeft: 8 }} />
          </label>
          <label>
            Název <input type="text" value={calendarForm.title} onChange={(e) => setCalendarForm((f) => ({ ...f, title: e.target.value }))} placeholder="Trénink" style={{ marginLeft: 8, width: 280 }} />
          </label>
          <label>
            Délka (min) <input type="number" min={15} max={480} value={calendarForm.durationMin} onChange={(e) => setCalendarForm((f) => ({ ...f, durationMin: Number(e.target.value) || 60 }))} style={{ marginLeft: 8, width: 80 }} />
          </label>
          <label>
            Přiřadit uživatelům (e-maily, oddělené čárkou nebo středníkem)
            <textarea value={calendarForm.userEmails} onChange={(e) => setCalendarForm((f) => ({ ...f, userEmails: e.target.value }))} placeholder="jan@example.cz, eva@example.cz" rows={2} style={{ display: 'block', marginTop: 4, width: '100%', maxWidth: 400 }} />
          </label>
          <button type="submit" disabled={calendarSubmit.loading} style={{ padding: '10px 20px', cursor: calendarSubmit.loading ? 'wait' : 'pointer' }}>
            {calendarSubmit.loading ? 'Ukládám…' : 'Přidat trénink do kalendáře'}
          </button>
          {calendarSubmit.message && <p style={{ color: calendarSubmit.message.startsWith('Trénink') ? 'green' : 'crimson', fontSize: 14 }}>{calendarSubmit.message}</p>}
        </form>
      </section>

      <p>Poslední záznamy z <code>body_metrics</code>. (<button onClick={downloadCSV}>Stáhnout CSV</button>)</p>

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['created_at','email','name','gender','age','height_cm','weight_kg','body_fat_percentage','water_percentage','bmi','tdee','user_id','id']
                .map(col => (
                  <th key={col} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>{col}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.created_at}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.email}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.name}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.gender}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.age}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.height_cm}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.weight_kg}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.body_fat_percentage}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.water_percentage}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.bmi}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{r.tdee}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee', fontSize: 12, color: '#666' }}>{r.user_id}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee', fontSize: 12, color: '#666' }}>{r.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
