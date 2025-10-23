import { useState } from "react";

export default function StartPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "",
    age: "",
    height: "",
    weight: "",
    activity: "",
    stress: "",
    workType: "",
    goal: "",
    frequency: "",
    notes: "",
  });

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch("/api/assistant-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, program: "START" }),
      });

      const result = await res.json();
      if (result.success) {
        alert("✅ Formulář úspěšně odeslán! Zkontroluj e-mailovou schránku.");
        setFormData({
          name: "",
          email: "",
          gender: "",
          age: "",
          height: "",
          weight: "",
          activity: "",
          stress: "",
          workType: "",
          goal: "",
          frequency: "",
          notes: "",
        });
      } else {
        alert("⚠️ Chyba: " + result.message);
      }
    } catch (error) {
      alert("❌ Chyba serveru: " + error.message);
    }
  };

  return (
    <main className="container" style={{ padding: "60px 0" }}>
      <h1 className="center">START Program – Začni zdarma</h1>
      <p className="center muted">
        Vyzkoušej systém bez rizika – AI ti připraví osobní plán tréninku,
        jídelníček a regeneraci zdarma.
      </p>

      <form className="form" onSubmit={handleSubmit} style={{ marginTop: 40 }}>
        <div className="row">
          <div>
            <label>Jméno a příjmení</label>
            <input
              className="input"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label>E-mail</label>
            <input
              type="email"
              className="input"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="row">
          <div>
            <label>Pohlaví</label>
            <select
              className="select"
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="Muž">Muž</option>
              <option value="Žena">Žena</option>
            </select>
          </div>
          <div>
            <label>Věk</label>
            <input
              className="input"
              name="age"
              type="number"
              value={formData.age}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="row">
          <div>
            <label>Výška (cm)</label>
            <input
              className="input"
              name="height"
              type="number"
              value={formData.height}
              onChange={handleChange}
            />
          </div>
          <div>
            <label>Váha (kg)</label>
            <input
              className="input"
              name="weight"
              type="number"
              value={formData.weight}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="row">
          <div>
            <label>Aktivita</label>
            <select
              className="select"
              name="activity"
              value={formData.activity}
              onChange={handleChange}
            >
              <option value="">Vyber</option>
              <option value="Nízká">Nízká</option>
              <option value="Střední">Střední</option>
              <option value="Vysoká">Vysoká</option>
            </select>
          </div>
          <div>
            <label>Míra stresu</label>
            <select
              className="select"
              name="stress"
              value={formData.stress}
              onChange={handleChange}
            >
              <option value="">Vyber</option>
              <option value="Nízká">Nízká</option>
              <option value="Střední">Střední</option>
              <option value="Vysoká">Vysoká</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div>
            <label>Typ práce</label>
            <select
              className="select"
              name="workType"
              value={formData.workType}
              onChange={handleChange}
            >
              <option value="">Vyber</option>
              <option value="Kancelář / IT">Kancelář / IT</option>
              <option value="Manuální">Manuální</option>
              <option value="Jiné">Jiné</option>
            </select>
          </div>
          <div>
            <label>Cíl</label>
            <select
              className="select"
              name="goal"
              value={formData.goal}
              onChange={handleChange}
            >
              <option value="">Vyber</option>
              <option value="Redukce hmotnosti">Redukce hmotnosti</option>
              <option value="Nárůst svalů">Nárůst svalů</option>
              <option value="Zdraví a energie">Zdraví a energie</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div>
            <label>Frekvence cvičení</label>
            <select
              className="select"
              name="frequency"
              value={formData.frequency}
              onChange={handleChange}
            >
              <option value="">Vyber</option>
              <option value="1–2× týdně">1–2× týdně</option>
              <option value="3–4× týdně">3–4× týdně</option>
              <option value="5× a více">5× a více</option>
            </select>
          </div>
        </div>

        <div>
          <label>Poznámky (volitelné)</label>
          <textarea
            className="input"
            rows="3"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Zdravotní omezení, preference jídel..."
          />
        </div>

        <button className="submit">Dokončit registraci</button>
      </form>
    </main>
  );
}
