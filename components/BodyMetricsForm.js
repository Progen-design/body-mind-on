// /components/BodyMetricsForm.js - Sdílený formulář pro body metrics (používá se v pricing.js i start.js)
import { useState } from 'react';

export default function BodyMetricsForm({ onSubmitSuccess, submitLabel = 'Dokončit registraci' }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState('stredne');
  const [stress, setStress] = useState('medium');
  const [occupation, setOccupation] = useState('office_it');
  const [goal, setGoal] = useState('redukce');
  const [freq, setFreq] = useState('2-3');
  const [weeklyUser, setWeeklyUser] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const payload = {
        user_id: null,
        email: email || null,
        name: name || null,
        gender,
        age: age !== '' && age != null ? Number(age) : null,
        height_cm: height !== '' && height != null ? Number(height) : null,
        weight_kg: weight !== '' && weight != null ? Number(weight) : null,
        activity,
        stress_level: stress,
        occupation,
        goal,
        freq_choice: freq,
        weekly_sessions_user: weeklyUser ? Number(weeklyUser) : null,
        notes: notes || null
      };

      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const successMsg = data.isNewUser
        ? 'Registrace proběhla úspěšně! Tvůj účet byl vytvořen. Plán ti přijde na e-mail. Nyní se můžeš přihlásit do svého profilu.'
        : 'Údaje uloženy. Plán ti přijde na e-mail. Můžeš se přihlásit do profilu.';
      setMsg(successMsg);
      onSubmitSuccess?.(data);
    } catch (err) {
      setMsg(`Chyba: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="body-metrics-form">
      <div className="grid">
        <div className="full">
          <label>Jméno a příjmení (volitelné)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Jan Test" />
        </div>

        <div className="full">
          <label>E-mail <span className="required">(povinný – slouží k registraci a přístupu do profilu)</span></label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@example.com" required />
        </div>

        <div>
          <label>Pohlaví</label>
          <select value={gender} onChange={e => setGender(e.target.value)}>
            <option value="male">Muž</option>
            <option value="female">Žena</option>
          </select>
        </div>

        <div>
          <label>Věk (roky)</label>
          <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="35" />
        </div>

        <div>
          <label>Výška (cm)</label>
          <input type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="180" />
        </div>

        <div>
          <label>Váha (kg)</label>
          <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="80" />
        </div>

        <div>
          <label>Aktivita</label>
          <select value={activity} onChange={e => setActivity(e.target.value)}>
            <option value="sedavy">Sedavý</option>
            <option value="lehce">Mírně aktivní</option>
            <option value="stredne">Středně aktivní</option>
            <option value="velmi">Vysoce aktivní</option>
            <option value="extra">Extra aktivní</option>
          </select>
        </div>

        <div>
          <label>Míra stresu</label>
          <select value={stress} onChange={e => setStress(e.target.value)}>
            <option value="low">Nízká</option>
            <option value="medium">Střední</option>
            <option value="high">Vysoká</option>
          </select>
        </div>

        <div>
          <label>Typ práce</label>
          <select value={occupation} onChange={e => setOccupation(e.target.value)}>
            <option value="office_it">Kancelář / IT</option>
            <option value="driver">Řidič / Kurýr</option>
            <option value="warehouse">Sklad / Logistika (směnný provoz)</option>
            <option value="manual">Manuální</option>
            <option value="healthcare">Zdravotnictví</option>
            <option value="teacher_sales">Učitel / Obchod</option>
            <option value="gastronomy">Gastronomie</option>
          </select>
        </div>

        <div>
          <label>Cíl</label>
          <select value={goal} onChange={e => setGoal(e.target.value)}>
            <option value="redukce">Redukce hmotnosti</option>
            <option value="udrzovani">Udržování</option>
            <option value="nabirani_svaly">Nabírání svalů</option>
          </select>
        </div>

        <div>
          <label>Frekvence cvičení</label>
          <select value={freq} onChange={e => setFreq(e.target.value)}>
            <option value="0-1">0–1× týdně</option>
            <option value="2-3">2–3× týdně</option>
            <option value="4plus">4+ týdně</option>
          </select>
        </div>

        <div>
          <label>Tvoje volba frekvence (1 / 3 / 5 – volitelné)</label>
          <input type="number" value={weeklyUser} onChange={e => setWeeklyUser(e.target.value)} placeholder="3" />
        </div>

        <div className="full">
          <label>Poznámky (volitelné)</label>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Zdravotní omezení, preference jídel…" />
        </div>
      </div>

      <button type="submit" className="btn" disabled={loading}>
        {loading ? 'Odesílám…' : submitLabel}
      </button>
      {msg && (
        <div className="msg-block">
          <p className="msg">{msg}</p>
          {msg.includes('přihlásit') && (
            <a href="/login" className="btn-login">Přihlásit se do profilu →</a>
          )}
        </div>
      )}

      <style jsx>{`
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .full { grid-column: 1 / -1; }
        label { display: block; margin-bottom: 6px; color: #bbb; }
        input, select, textarea {
          width: 100%; padding: 10px 12px; background: #111; color: #fff;
          border: 1px solid #2a2a2a; border-radius: 8px; outline: none;
        }
        .btn {
          width: 100%; margin-top: 16px;
          background: linear-gradient(90deg, #0ea5e9, #0284c7);
          color: #fff; padding: 14px 16px; border-radius: 10px; border: none; font-weight: 600;
        }
        .required { color: #888; font-weight: normal; }
        .msg-block { margin-top: 16px; }
        .msg { margin: 0 0 12px 0; }
        .btn-login {
          display: inline-block; margin-top: 8px;
          color: #2ECC71; text-decoration: none; font-weight: 600;
        }
        .btn-login:hover { text-decoration: underline; }
      `}</style>
    </form>
  );
}
