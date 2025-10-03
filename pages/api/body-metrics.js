// /pages/register.js
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function RegisterAll() {
  // Identifikace (můžeš předvyplnit z URL/localStorage, ale jsou i v UI)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('male'); // male|female

  // Výpočetní vstupy (1:1 s DB)
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState('stredne');         // sedavy|lehce|stredne|velmi|extra
  const [stressLevel, setStressLevel] = useState('medium');    // low|medium|high
  const [occupation, setOccupation] = useState('office_it');   // office_it|driver|warehouse|manual|healthcare|teacher_sales|gastronomy
  const [goal, setGoal] = useState('redukce');                 // redukce|udrzovani|nabirani_svaly
  const [freqChoice, setFreqChoice] = useState('2-3');         // 0-1|2-3|4plus
  const [weeklySessionsUser, setWeeklySessionsUser] = useState(''); // volitelné číslo 1–7
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Předvyplnění z URL/localStorage (nepovinné)
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const n = p.get('name') || localStorage.getItem('bmo_name');
      const e = p.get('email') || localStorage.getItem('bmo_email');
      const g = p.get('gender') || localStorage.getItem('bmo_gender');
      if (n) setName(n);
      if (e) setEmail(e);
      if (g) setGender(g);
    } catch {}
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setMsg(null);

    try {
      const payload = {
        user_id: null,
        email: email || null,
        name: name || null,
        gender: gender || null,            // server případně normalizuje
        age, height_cm: height, weight_kg: weight,
        activity, stress_level: stressLevel, occupation, goal,
        freq_choice: freqChoice,
        weekly_sessions_user: weeklySessionsUser,
        notes
      };

      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || 'Neznámá chyba');

      setMsg('Úspěšně odesláno ✅');
    } catch (err) {
      setMsg(`Chyba ❌: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="container" style={{maxWidth: 900, margin: '40px auto', padding: '0 16px'}}>
        <h1 style={{marginBottom: 12}}>Detaily pro „Start“</h1>

        <form onSubmit={onSubmit} className="grid">
          {/* Identifikace */}
          <div className="row">
            <div>
              <label>Jméno</label>
              <input type="text" placeholder="Jan Novák" value={name} onChange={e=>setName(e.target.value)} required />
            </div>
            <div>
              <label>E-mail</label>
              <input type="email" placeholder="jan@example.com" value={email} onChange={e=>setEmail(e.target.value)} required />
            </div>
          </div>

          <div className="row">
            <div>
              <label>Pohlaví</label>
              <select value={gender} onChange={e=>setGender(e.target.value)}>
                <option value="male">Muž</option>
                <option value="female">Žena</option>
              </select>
            </div>
            <div>
              <label>Věk (roky)</label>
              <input type="number" min="10" max="100" placeholder="35" value={age} onChange={e=>setAge(e.target.value)} required />
            </div>
          </div>

          {/* Tělesná měření */}
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

          {/* Životní styl */}
          <div className="row">
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
            <div>
              <label>Míra stresu</label>
              <select value={stressLevel} onChange={e=>setStressLevel(e.target.value)}>
                <option value="low">Nízká</option>
                <option value="medium">Střední</option>
                <option value="high">Vysoká</option>
              </select>
            </div>
          </div>

          <div className="row">
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
            <div>
              <label>Cíl</label>
              <select value={goal} onChange={e=>setGoal(e.target.value)}>
                <option value="redukce">Redukce hmotnosti</option>
                <option value="udrzovani">Udržování</option>
                <option value="nabirani_svaly">Nabírání svalové hmoty</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div>
              <label>Frekvence cvičení</label>
              <select value={freqChoice} onChange={e=>setFreqChoice(e.target.value)}>
                <option value="0-1">0–1× týdně</option>
                <option value="2-3">2–3× týdně</option>
                <option value="4plus">4+ týdně</option>
              </select>
            </div>
            <div>
              <label>Preferovaná frekvence (volitelně)</label>
              <input type="number" min="1" max="7" placeholder="např. 3"
                     value={weeklySessionsUser} onChange={e=>setWeeklySessionsUser(e.target.value)} />
            </div>
          </div>

          <div className="row single">
            <div>
              <label>Poznámky (volitelné)</label>
              <textarea rows={4} placeholder="Zdravotní omezení, preference jídel, vybavení doma…"
                        value={notes} onChange={e=>setNotes(e.target.value)} />
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
        .row { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
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
      `}</style>
    </>
  );
}
