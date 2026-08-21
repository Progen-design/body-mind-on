import React from 'react';
import { supabaseServer } from '../lib/supabaseServer';

export async function getServerSideProps({ query }) {
  // jednoduché zabezpečení: /admin?key=TVŮJ_TOKEN
  const key = query.key || '';
  if (!process.env.ADMIN_TOKEN || key !== process.env.ADMIN_TOKEN) {
    return { notFound: true };
  }

  const [metricsRes, agentsRes] = await Promise.all([
    supabaseServer.from('body_metrics').select('id, created_at, user_id, email, name, gender, age, height_cm, weight_kg, body_fat_percentage, water_percentage, bmi, tdee').order('created_at', { ascending: false }).limit(200),
    supabaseServer.from('ai_agents').select('id, slug, name, model, system_prompt, temperature, enabled').order('slug'),
  ]);

  if (metricsRes.error) {
    return { props: { rows: [], agents: agentsRes.data || [], err: metricsRes.error.message, adminKey: key } };
  }
  return {
    props: {
      rows: metricsRes.data || [],
      agents: agentsRes.data || [],
      err: null,
      adminKey: key,
    },
  };
}

export default function Admin({ rows, agents: initialAgents, err, adminKey }) {
  const [agents, setAgents] = React.useState(initialAgents || []);
  const [editingSlug, setEditingSlug] = React.useState(null);
  const [agentForm, setAgentForm] = React.useState({ name: '', model: '', system_prompt: '', temperature: 0.2, enabled: true });
  const [agentSave, setAgentSave] = React.useState({ loading: false, message: '' });

  const startEdit = (a) => {
    setEditingSlug(a.slug);
    setAgentForm({ name: a.name || '', model: a.model || '', system_prompt: a.system_prompt || '', temperature: Number(a.temperature) ?? 0.2, enabled: a.enabled !== false });
  };
  const cancelEdit = () => { setEditingSlug(null); setAgentSave({ loading: false, message: '' }); };

  const saveAgent = async (e) => {
    e.preventDefault();
    if (!adminKey || !editingSlug) return;
    setAgentSave({ loading: true, message: '' });
    try {
      const res = await fetch(`/api/admin/agents?key=${encodeURIComponent(adminKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey, slug: editingSlug, ...agentForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba');
      setAgents((prev) => prev.map((a) => (a.slug === editingSlug ? { ...a, ...agentForm } : a)));
      setAgentSave({ loading: false, message: 'Uloženo.' });
      setTimeout(() => { setEditingSlug(null); setAgentSave((s) => ({ ...s, message: '' })); }, 2000);
    } catch (e) {
      setAgentSave({ loading: false, message: e.message || 'Nepodařilo se uložit' });
    }
  };

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

      <section style={{ marginBottom: 32, padding: 20, background: '#f0f9ff', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>AI asistenti (OpenAI)</h2>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
          Instrukce a nastavení se berou z tabulky <code>ai_agents</code> v Supabase. Úpravy se projeví u dalších generování plánů a koučovacích zpráv.
        </p>
        {agents.length === 0 ? (
          <p style={{ color: '#666' }}>Žádní agenti v DB. Spusť migraci <code>20260312_ai_agents_seed.sql</code>.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {agents.map((a) => (
              <div key={a.slug} style={{ border: '1px solid #bae6fd', borderRadius: 8, padding: 16, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong>{a.name}</strong>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{a.slug}</span>
                  {editingSlug !== a.slug ? (
                    <button type="button" onClick={() => startEdit(a)} style={{ padding: '6px 12px', cursor: 'pointer' }}>Upravit</button>
                  ) : (
                    <button type="button" onClick={cancelEdit} style={{ padding: '6px 12px', cursor: 'pointer' }}>Zrušit</button>
                  )}
                </div>
                {editingSlug === a.slug ? (
                  <form onSubmit={saveAgent} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <label>
                      Název <input type="text" value={agentForm.name} onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))} style={{ width: '100%', maxWidth: 400, marginLeft: 8 }} />
                    </label>
                    <label>
                      Model <input type="text" value={agentForm.model} onChange={(e) => setAgentForm((f) => ({ ...f, model: e.target.value }))} placeholder="gpt-4.1" style={{ width: '100%', maxWidth: 200, marginLeft: 8 }} />
                    </label>
                    <label>
                      Teplota (0–1) <input type="number" min={0} max={1} step={0.1} value={agentForm.temperature} onChange={(e) => setAgentForm((f) => ({ ...f, temperature: Number(e.target.value) || 0.2 }))} style={{ width: 80, marginLeft: 8 }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={agentForm.enabled} onChange={(e) => setAgentForm((f) => ({ ...f, enabled: e.target.checked }))} />
                      Zapnutý (enabled)
                    </label>
                    <label>
                      Systémové instrukce (system prompt)
                      <textarea value={agentForm.system_prompt} onChange={(e) => setAgentForm((f) => ({ ...f, system_prompt: e.target.value }))} rows={6} style={{ display: 'block', marginTop: 4, width: '100%', maxWidth: 700, fontFamily: 'monospace', fontSize: 13 }} />
                    </label>
                    <button type="submit" disabled={agentSave.loading} style={{ padding: '10px 20px', cursor: agentSave.loading ? 'wait' : 'pointer', alignSelf: 'flex-start' }}>
                      {agentSave.loading ? 'Ukládám…' : 'Uložit změny'}
                    </button>
                    {agentSave.message && <span style={{ color: agentSave.message === 'Uloženo.' ? 'green' : 'crimson', fontSize: 14 }}>{agentSave.message}</span>}
                  </form>
                ) : (
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    <div>Model: {a.model} · teplota: {a.temperature} · {a.enabled !== false ? 'zapnutý' : 'vypnutý'}</div>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 4, maxHeight: 120, overflow: 'auto', fontSize: 12 }}>{a.system_prompt}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
