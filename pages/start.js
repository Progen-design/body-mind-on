import { useState } from "react";

export default function StartPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "Muž",
    age: "",
    height: "",
    weight: "",
    notes: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/start-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Server error");
      alert("Formulář byl úspěšně odeslán!");
      setFormData({ name: "", email: "", gender: "Muž", age: "", height: "", weight: "", notes: "" });
    } catch (err) {
      alert("Nastala chyba při odesílání: " + err.message);
    }
  };

  return (
    <main>
      {/* Hero sekce */}
      <section className="container center" style={{ paddingTop: "60px" }}>
        <h1 className="text-5xl font-bold bg-gradient-to-r from-[#8bc7ff] to-[#c2a6ff] bg-clip-text text-transparent mb-4">
          START Program – Začni zdarma
        </h1>
        <p className="muted text-lg max-w-2xl mx-auto">
          Vyzkoušej systém bez rizika — během pár minut získáš osobní plán tréninku, jídelníčku i regenerace zdarma.
          <br /> První týden zcela zdarma, bez závazků.
        </p>
        <button className="btn" style={{ marginTop: "24px" }}>Začít zdarma 🚀</button>
      </section>

      {/* Výhody */}
      <section className="container" style={{ marginTop: "80px" }}>
        <h2 className="text-3xl font-semibold mb-8 center">Co získáš v programu START</h2>
        <div className="pricing-grid">
          <div className="card">
            <h3>💪 Tréninkový plán</h3>
            <p className="muted">AI trenér ti sestaví cvičební plán přesně podle tvých cílů a možností.</p>
          </div>
          <div className="card">
            <h3>🥗 Jídelníček</h3>
            <p className="muted">Každý týden dostaneš personalizovaný plán stravy z běžně dostupných surovin.</p>
          </div>
          <div className="card">
            <h3>🧘 Regenerace</h3>
            <p className="muted">Získáš doporučení pro spánek, regeneraci a mentální pohodu.</p>
          </div>
        </div>
      </section>

      {/* Formulář */}
      <section className="container" style={{ marginTop: "100px" }}>
        <h2 className="text-3xl font-semibold mb-6 center">Aktivuj svůj osobní plán START</h2>
        <form className="form" onSubmit={handleSubmit}>
          <div className="row">
            <div>
              <label className="label">Jméno a příjmení</label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="input"
                placeholder="Jan Novák"
              />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="input"
                placeholder="jan@example.com"
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Pohlaví</label>
              <select name="gender" value={formData.gender} onChange={handleChange} className="select">
                <option>Muž</option>
                <option>Žena</option>
              </select>
            </div>
            <div>
              <label className="label">Věk</label>
              <input
                name="age"
                type="number"
                value={formData.age}
                onChange={handleChange}
                className="input"
                placeholder="např. 35"
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Výška (cm)</label>
              <input
                name="height"
                type="number"
                value={formData.height}
                onChange={handleChange}
                className="input"
                placeholder="180"
              />
            </div>
            <div>
              <label className="label">Váha (kg)</label>
              <input
                name="weight"
                type="number"
                value={formData.weight}
                onChange={handleChange}
                className="input"
                placeholder="75"
              />
            </div>
          </div>

          <div>
            <label className="label">Poznámky (volitelné)</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="input"
              placeholder="Zdravotní omezení, preference jídel..."
            />
          </div>

          <button type="submit" className="submit">Dokončit registraci</button>
          <p className="note center">Tvůj osobní plán ti přijde e-mailem během 2 minut po odeslání.</p>
        </form>
      </section>
    </main>
  );
}
