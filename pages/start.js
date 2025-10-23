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
    workType: "",
    goal: "",
    notes: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch("/api/assistant-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await res.json();

      if (result.success) {
        alert("✅ Formulář úspěšně odeslán!");
        setFormData({
          name: "",
          email: "",
          gender: "",
          age: "",
          height: "",
          weight: "",
          activity: "",
          workType: "",
          goal: "",
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
      <h1 style={{ textAlign: "center" }}>START Program – Začni zdarma</h1>
      <p style={{ textAlign: "center", color: "#aaa" }}>
        Vyzkoušej systém bez rizika — AI ti připraví osobní plán tréninku,
        jídelníček i regeneraci zdarma.
      </p>

      <div className="card" style={{ marginTop: "40px", padding: "40px" }}>
        <h2>Aktivuj svůj osobní plán START</h2>

        <form className="form" onSubmit={handleSubmit}>
          <div className="row">
            <div>
              <label className="label">Jméno a příjmení</label>
              <input
                type="text"
                name="name"
                className="input"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                name="email"
                className="input"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Pohlaví</label>
              <select
                name="gender"
                className="select"
                value={formData.gender}
                onChange={handleChange}
              >
                <option value="">Vyber</option>
                <option value="Muž">Muž</option>
                <option value="Žena">Žena</option>
              </select>
            </div>

            <div>
              <label className="label">Věk</label>
              <input
                type="number"
                name="age"
                className="input"
                placeholder="např. 35"
                value={formData.age}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Výška (cm)</label>
              <input
                type="number"
                name="height"
                className="input"
                value={formData.height}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="label">Váha (kg)</label>
              <input
                type="number"
                name="weight"
                className="input"
                value={formData.weight}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <label className="label">Poznámky (volitelné)</label>
            <textarea
              name="notes"
              className="input"
              rows="3"
              placeholder="Zdravotní omezení, preference jídel..."
              value={formData.notes}
              onChange={handleChange}
            />
          </div>

          <button type="submit" className="submit">
            Dokončit registraci
          </button>
        </form>
      </div>
    </main>
  );
}
