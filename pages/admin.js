import { createClient } from '@supabase/supabase-js';

/** server-side Supabase client (service role) */
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Chybí SUPABASE env proměnné');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function getServerSideProps({ query, res }) {
  // jednoduché zabezpečení: /admin?key=TVŮJ_TOKEN
  const key = query.key || '';
  if (!process.env.ADMIN_TOKEN || key !== process.env.ADMIN_TOKEN) {
    return { notFound: true };
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('body_metrics')
    .select('id, created_at, user_id, email, name, gender, age, height_cm, weight_kg, body_fat_percentage, water_percentage, bmi, tdee')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return { props: { rows: [], err: error.message } };
  }
  return { props: { rows: data, err: null } };
}

export default function Admin({ rows, err }) {
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
