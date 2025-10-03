// /pages/register.js
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function RegisterDetails() {
  // zkusím doplnit name/email/gender z URL nebo localStorage (pokud existují z předchozího kroku)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState(''); // male|female (volitelné – pokud není, insert projde, schema to nevyžaduje)

  // výpočetní vstupy
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState('stredne');       // sedavy|lehce|stredne|velmi|extra
  const [stressLevel, setStressLevel] = useState('medium');  // low|medium|high
  const [occupation, setOccupation] = useState('office_it'); // office_it|driver|warehouse|manual|healthcare|teacher_sales|gastronomy
  const [goal, setGoal] = useState('redukce');               // redukce|udrzovani|nabirani_svaly
  const [freqChoice, setFreqChoice] = useState('2-3');       // 0-1|2-3|4plus
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // načti z URL / localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const n = params.get('name') || localStorage.getItem('bmo_name') || '';
      const e = params.get('email') || localStorage.getItem('bmo_email') || '';
      const g = params.get('gender') || localStorage.getItem('bmo_gender') || '';
      if (n) setName(n);
      if (e) setEmail(e);
      if (g) setGender(g);
    } catch (_) {}
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setMsg(null);

    try {
      const payload = {
        // identifikace z předchozího kroku (pokud byla k dispozici)
        name: name || null,
        email: email || null,
        gender: gender || null,       // očekává se 'male' nebo 'female' (trigger zvládne i 'muz'/'žena')
        // výpočetní vstupy
        age,
        height_cm: height,
        weight_kg: weight,
        activity,
        stress_level: stressLevel,
        occupation,
        goal,
        freq_choice: freqChoice,
        notes
      };

      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Unknown error');

      setMsg('Úspěšně odesláno ✅');
    } catch (err) {
      console.error('[register-details] submit error:', err);
      setMsg('Chyba – zkus to znovu ❌: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="container" style={{maxWidth: 860, margin: '40px auto', padding: '0 16px'}}>
        <h1 style={{marginBottom: 12}}>Detaily pro „Start“</h1>

        {/* Info: pokud máme name/email z předchozího kroku, ukážeme je jen pro kontrolu */}
        {(name || email) && (
          <div className="info">
            {name && <span>👤 {name}</span>}
            {email && <span>✉️ {email}</span>}
            {gender && <span>⚧ {gender}</span>}
          </div>
        )}

        <form onSubmit={onSubmit} className="grid">
          <div className="row">
            <div>
              <label>Výška (cm)</label>
              <input type="number" min="100" max="240" placeholder="180" value={height} onChange={e=>setHeight(e.target.value)} required />
            </div>
            <div>
              <label>Váha (kg)</label>
              <input type="number" min="30" max="250" placeholder="82" value={weight} onChange={e=>setWeight(e.target.value)} required />
            </div>
          </div>

          <div className="row">
            <div>
              <label>Věk (roky)</label>
              <input type="number" min="10" max="100" placeholder="35" value={age} onChange={e=>setAge(e.target.value)} required />
            </div>
            <div>
              <label>Aktivita</label>
              <select value={activity} onChange={e=>setActivity(e.target.value)}>
                <option value="sedavy">Sedavý režim</option>
                <option value="lehce">Lehce aktivní</option>
                <option value="stredne">Středně aktivní</option>
                <option value="velmi">Velmi aktivní</option>
                <option value="extra">Extra aktivní</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div>
              <label>Míra stresu</label>
              <select value={stressLevel} onChange={e=>setStressLevel(e.target.value)}>
                <option value="low">Nízká</option>
                <option value="medium">Střední</option>
                <option value="high">Vysoká</option>
              </select>
            </div>
            <div>
              <label>Typ práce</label>
              <select value={occupation} onChange={e=>setOccupation(e.target.value)}>
                <option value="office_it">Kancelář / IT</option>
                <option value="driver">Řidič</option>
                <option value="warehouse">Sklad / logistika</option>
                <option value="manual">Manuální práce</option>
                <option value="healthcare">Zdravotnictví</option>
                <option value="teacher_sales">Učitel / Obchod</option>
                <option value="gastronomy">Gastronomie</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div>
              <label>Cíl</label>
              <select value={goal} onChange={e=>setGoal(e.target.value)}>
                <option value="redukce">Redukce hmotnosti</option>
                <option value="udrzovani">Udržování</option>
                <option value="nabirani_svaly">Nabírání svalové hmoty</option>
              </select>
            </div>
            <div>
              <label>Frekvence cvičení</label>
              <select value={freqChoice} onChange={e=>setFreqChoice(e.target.value)}>
                <option value="0-1">0–1× týdně</option>
                <option value="2-3">2–3× týdně</option>
                <option value="4plus">4+ týdně</option>
              </select>
            </div>
          </div>

          <div className="row single">
            <div>
              <label>Poznámky (volitelné)</label>
              <textarea rows={4} placeholder="Zdravotní omezení, preference jídel, vybavení doma…" value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Odesílám…' : 'Dokončit registraci'}
          </button>

          {msg && <p className={`msg ${msg.includes('✅') ? 'ok' : 'err'}`}>{msg}</p>}
        </form>
      </main>
      <Footer />

      <style jsx>{`
        .grid { display:grid; gap:16px; }
        .row { display:grid; grid-template-columns: 1fr 1fr; gap:16px; 
        .row.single { grid-template-columns: 1fr; }
        label { display:block; color:#bbb; font-size:14px; margin-bottom:6px; }
        input, select, textarea {
          width:100%; padding:10px 12px; background:#121212; border:1px solid #2a2a2a;
          color:#fff; border-radius:8px; outline:none;
        }
        .btn { padding:12px 18px; background:#1e90ff; color:#fff; border:0; border-radius:10px; font-weight:600; cursor:pointer; }
        .btn:disabled { opacity:.7; cursor:default; }
        .msg { margin-top:8px; }
        .ok { color:#2ecc71; }
        .err { color:#e74c3c; }
        .info { display:flex; gap:12px; margin:8px 0 16px; color:#9ad; font-size:14px; }
      `}</style>
    </>
  );
}
