import { useState } from "react";

export default function Start() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "",
    age: "",
    height: "",
    weight: "",
    activity: "",
    stress: "",
    worktype: "", // správně lowercase podle Supabase
    goal: "",
    frequency: "",
    notes: "",
    program: "START",
  });

  const [status, setStatus] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("Odesílám...");

  const res = await fetch("/api/body-metrics", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(formData),
});


      const result = await res.json();

      if (res.ok) {
        setStatus("✅ Formulář úspěšně odeslán!");
        setFormData({
          name: "",
          email: "",
          gender: "",
          age: "",
          height: "",
          weight: "",
          activity: "",
          stress: "",
          worktype: "",
          goal: "",
          frequency: "",
          notes: "",
          program: "START",
        });
      } else {
        setStatus("❌ Chyba serveru: " + (result.message || "Nepodařilo se odeslat."));
      }
    } catch (err) {
      setStatus("❌ Chyba připojení: " + err.message);
    }
  };

  return (
    <main className="container py-12">
      <section className="text-center mb-10">
        <h1 className="text-4xl font-extrabold mb-3 text-white">
          START Program – Začni zdarma
        </h1>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto">
          Vyzkoušej systém bez rizika – AI ti zdarma připraví osobní plán tréninku, jídelníček i regeneraci.
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="form max-w-3xl mx-auto bg-[#121212] p-8 rounded-2xl shadow-lg border border-[#222] space-y-6"
      >
        {/* Základní informace */}
        <div className="row">
          <div>
            <label className="label">Jméno a příjmení</label>
            <input
              name="name"
              className="input"
              value={formData.name}
              onChange={handleChange}
              placeholder="Jan Novák"
              required
            />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input
              name="email"
              type="email"
              className="input"
              value={formData.email}
              onChange={handleChange}
              placeholder="jan@example.com"
              required
            />
          </div>
        </div>

        {/* Demografie */}
        <div className="row">
          <div>
            <label className="label">Pohlaví</label>
            <select
              name="gender"
              className="select"
              value={formData.gender}
              onChange={handleChange}
            >
              <option value="">-- Vyber --</option>
              <option value="Muž">Muž</option>
              <option value="Žena">Žena</option>
            </select>
          </div>
          <div>
            <label className="label">Věk (roky)</label>
            <input
              name="age"
              type="number"
              className="input"
              value={formData.age}
              onChange={handleChange}
              placeholder="30"
              required
            />
          </div>
        </div>

        {/* Tělesné parametry */}
        <div className="row">
          <div>
            <label className="label">Výška (cm)</label>
            <input
              name="height"
              type="number"
              className="input"
              value={formData.height}
              onChange={handleChange}
              placeholder="180"
              required
            />
          </div>
          <div>
            <label className="label">Váha (kg)</label>
            <input
              name="weight"
              type="number"
              className="input"
              value={formData.weight}
              onChange={handleChange}
              placeholder="80"
              required
            />
          </div>
        </div>

        {/* Aktivita a stres */}
        <div className="row">
          <div>
            <label className="label">Úroveň aktivity</label>
            <select
              name="activity"
              className="select"
              value={formData.activity}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="Nízká">Nízká</option>
              <option value="Střední">Střední</option>
              <option value="Vysoká">Vysoká</option>
            </select>
          </div>
          <div>
            <label className="label">Míra stresu</label>
            <select
              name="stress"
              className="select"
              value={formData.stress}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="Nízká">Nízká</option>
              <option value="Střední">Střední</option>
              <option value="Vysoká">Vysoká</option>
            </select>
          </div>
        </div>

        {/* Práce a cíl */}
        <div className="row">
          <div>
            <label className="label">Typ práce</label>
            <select
              name="worktype"
              className="select"
              value={formData.worktype}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="Kancelář / IT">Kancelář / IT</option>
              <option value="Manuální">Manuální</option>
              <option value="Kombinovaná">Kombinovaná</option>
            </select>
          </div>
          <div>
            <label className="label">Cíl</label>
            <select
              name="goal"
              className="select"
              value={formData.goal}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="Redukce hmotnosti">Redukce hmotnosti</option>
              <option value="Nárůst svalů">Nárůst svalů</option>
              <option value="Zdravý životní styl">Zdravý životní styl</option>
            </select>
          </div>
        </div>

        {/* Frekvence */}
        <div>
          <label className="label">Frekvence cvičení</label>
          <select
            name="frequency"
            className="select"
            value={formData.frequency}
            onChange={handleChange}
            required
          >
            <option value="">Vyber</option>
            <option value="1-2x týdně">1–2x týdně</option>
            <option value="2-3x týdně">2–3x týdně</option>
            <option value="4-5x týdně">4–5x týdně</option>
          </select>
        </div>

        {/* Poznámky */}
        <div>
          <label className="label">Poznámky (volitelné)</label>
          <textarea
            name="notes"
            className="input"
            rows="3"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Zdravotní omezení, preference jídel..."
          />
        </div>

        {/* Tlačítko */}
        <button
          type="submit"
          className="submit text-white bg-gradient-to-r from-sky-500 to-sky-700 hover:opacity-90 transition font-semibold text-lg py-3"
        >
          Dokončit registraci
        </button>

        {status && (
          <p className="center mt-4 text-lg text-gray-300">{status}</p>
        )}
      </form>
    </main>
  );
}
