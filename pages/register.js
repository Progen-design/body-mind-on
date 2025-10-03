// /pages/register.js
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function RegisterDetails() {
  // z 1. kroku (URL / localStorage)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState(''); // male|female (nepovinné)

  // 1:1 vstupy do DB
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState('stredne');
  const [stressLevel, setStressLevel] = useState('medium');
  const [occupation, setOccupation] = useState('office_it');
  const [goal, setGoal] = useState('redukce');
  const [freqChoice, setFreqChoice] = useState('2-3');
  const [weeklySessionsUser, setWeeklySessionsUser] = useState(''); // volitelné číslo
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const n = p.get('name') || localStorage.getItem('bmo_name') || '';
      const e = p.get('email') || localStorage.getItem('bmo_email') || '';
      const g = p.get('gender') || localStorage.getItem('bmo_gender') || '';
      if (n) setName(n);
      if (e) setEmail(e);
      if (g) setGender(g);
    } catch {}
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg(null);
    try {
      const payload = {
        user_id: null,
        email: email || null,
        name: name || null,
        gender: gender || null,
        age, height_cm: height, weight_kg: weight,
        activity, stress_level: stressLevel, occupation, goal, freq_choice: freqChoice,
        weekly_sessions_user: weeklySessionsUser, // může zůstat null
        notes
      };

      const res = await fetch('/api/body-metrics', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(json.error || 'Unknown error');

      setMsg('Úspěšně odesláno ✅');
    } catch (err) {
      setMsg('Chyba – ' + err.message);
    } finally { setLoading(false); }
  };

  return (
    <>
      <Header />
      <main className="container" style={{maxWidth:860, margin:'40px auto', padding:'0 16px'}}>
        <h1 style={{marginBottom:12}}>Detaily pro „Start“</h1>

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
              <input type="number" min="100" max="240" value={height} onChange={e=>setHeight(e.target.value)} required />
            </div>
            <div>
              <label>Váha (kg)</label>
              <input type="number" min="30" max="250" value={weight} onChange={e=>setWeight(e.target.value)} required />
            </div>
          </div>

          <div className="row">
            <div>
              <label>Věk (roky)</label>
              <input type="number" min="10" max="100" value={age} onChange={e=>setAge(e.target.value)} required />
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

          <div className="row">
            <div>
              <label>Preferovaná frekvence od uživatele (volitelné)</label>
              <input type="number" min="1" max="7" placeholder="např. 3" value={weeklySessionsUser}
                     onChange={e=>setWeeklySessionsUser(e.target.value)} />
            </div>
            <div>
              <label>Poznámky (volitelné)</label>
              <input type="text" placeholder="omezení, preference jídel, vybavení…" value={notes}
                     onChange={e=>setNotes(e.target.value)} />
            </div>
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Odesílám…' : 'Dokončit registraci'}
          </button>
          {msg && <p className={`msg ${msg.includes('✅') ? 'ok':'err'}`}>{msg}</p>}
        </form>
      </main>
      <Footer />
      <style jsx>{`
        .grid { display:grid; gap:16px; }
        .row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        label { display:block; color:#bbb; font-size:14px; margin-bottom:6px; }
        input, select {
          width:100%; padding:10px 12px; background:#121212; border:1px solid #2a2a2a;
          color:#fff; border-radius:8px; outline:none;
        }
        .btn { padding:12px 18px; background:#1e90ff; color:#fff; border:0; border-radius:10px; font-weight:600; cursor:pointer; }
        .btn:disabled { opacity:.7; cursor:default; }
        .msg { margin-top:8px; }
        .ok { color:#2ecc71; } .err { color:#e74c3c; }
        .info { display:flex; gap:12px; margin:8px 0 16px; color:#9ad; font-size:14px; }
      `}</style>
    </>
  );
}
