import { useState } from "react";

export default function ProgramForm({ planType }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    gender: "Muž",
    age: "",
    height: "",
    weight: "",
    diet_type: "",
    dietary_restrictions: "",
    foods_to_avoid: "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const genderNorm = form.gender?.includes('Žena') || form.gender === 'female' ? 'female' : 'male';
      const payload = {
        name: form.name?.trim() || null,
        email: form.email?.trim() || null,
        gender: genderNorm,
        age: form.age ? Number(form.age) : null,
        height: form.height ? Number(form.height) : null,
        weight: form.weight ? Number(form.weight) : null,
        activity: 'stredne',
        stress: 'medium',
        worktype: 'office_it',
        goal: 'udrzovani',
        frequency: '2-3x týdně',
        diet_type: form.diet_type?.trim() || null,
        dietary_restrictions: form.dietary_restrictions?.trim() || null,
        foods_to_avoid: form.foods_to_avoid?.trim() || null,
        notes: form.notes?.trim() || null,
        program: planType || 'START',
      };

      const res = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: res.ok ? 'Neplatná odpověď serveru.' : `Chyba ${res.status}` };
      }

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data?.error || data?.message || 'Odeslání se nezdařilo. Zkus to znovu.');
      }
    } catch (err) {
      setError('Chyba připojení: ' + (err.message || 'Zkus to znovu.'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center text-green-400 mt-10">
        <h3 className="text-2xl font-bold mb-2">✅ Registrace dokončena!</h3>
        <p>Údaje byly uloženy a plán byl odeslán na e-mail. V e-mailu najdeš přihlašovací údaje – s nimi se můžeš přihlásit a vidět svůj profil.</p>
        <a href="/login" className="inline-block mt-6 text-green-400 underline hover:no-underline">Přihlásit se do profilu →</a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl mx-auto mt-10 p-10 bg-neutral-900/80 rounded-2xl shadow-xl border border-neutral-800 backdrop-blur"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <input
          name="name"
          placeholder="Jméno a příjmení"
          value={form.name}
          onChange={handleChange}
          required
          className="p-4 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
        <input
          name="email"
          placeholder="E-mail"
          value={form.email}
          onChange={handleChange}
          required
          type="email"
          className="p-4 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
        <select
          name="gender"
          value={form.gender}
          onChange={handleChange}
          className="p-4 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        >
          <option>👨 Muž</option>
          <option>👩 Žena</option>
        </select>
        <input
          name="age"
          placeholder="Věk"
          value={form.age}
          onChange={handleChange}
          required
          className="p-4 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
        <input
          name="height"
          placeholder="Výška (cm)"
          value={form.height}
          onChange={handleChange}
          required
          className="p-4 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
        <input
          name="weight"
          placeholder="Váha (kg)"
          value={form.weight}
          onChange={handleChange}
          required
          className="p-4 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
      </div>

      <div className="mt-6 rounded-xl overflow-hidden diet-section-program">
        <div className="diet-section-program-header">
          <span className="diet-section-program-icon">🥗</span>
          <div>
            <h3 className="diet-section-program-title">Strava a omezení (volitelné)</h3>
            <p className="diet-section-program-desc">Abychom do jídelníčku nezařadili to, co nejíš.</p>
          </div>
        </div>
        <div className="px-4 pb-4 pt-0 space-y-4 diet-section-program-body">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Typ stravy (volitelné)</label>
            <select
              name="diet_type"
              value={form.diet_type}
              onChange={handleChange}
              className="p-4 w-full rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400"
            >
              <option value="">Žádná preference</option>
              <option value="vegetarian">Vegetarián</option>
              <option value="vegan">Vegan</option>
              <option value="gluten_free">Bez lepku</option>
              <option value="lactose_free">Bez laktózy</option>
              <option value="paleo">Paleo</option>
              <option value="low_carb">Nízkosacharidová</option>
              <option value="other">Jiné</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Co nejí – alergie, intolerance (volitelné)</label>
            <textarea
              name="dietary_restrictions"
              placeholder="např. ořechy, mléko, lepek…"
              value={form.dietary_restrictions}
              onChange={handleChange}
              rows={2}
              className="p-4 w-full rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Potraviny k vynechání z jídelníčku (volitelné)</label>
            <textarea
              name="foods_to_avoid"
              placeholder="např. avokádo, brokolice, banány – konkrétní potraviny, které nemají být v plánu"
              value={form.foods_to_avoid}
              onChange={handleChange}
              rows={2}
              className="p-4 w-full rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400"
            />
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
      <style jsx>{`
        .diet-section-program {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(6, 78, 59, 0.06) 100%);
          border: 1px solid rgba(34, 197, 94, 0.35);
          box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.1), 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        .diet-section-program-header {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 18px 20px;
          background: rgba(34, 197, 94, 0.06);
          border-bottom: 1px solid rgba(34, 197, 94, 0.2);
        }
        .diet-section-program-icon { font-size: 28px; line-height: 1; }
        .diet-section-program-title { margin: 0; font-size: 1.1rem; font-weight: 700; color: #4ade80; letter-spacing: -0.02em; }
        .diet-section-program-desc { margin: 4px 0 0; font-size: 13px; color: #94a3b8; line-height: 1.4; }
        .diet-section-program-body { padding: 16px 20px 20px; }
      `}</style>
      <button
        type="submit"
        disabled={loading}
        className="mt-8 w-full py-4 bg-green-500 hover:bg-green-600 text-black font-semibold rounded-xl text-lg shadow-lg shadow-green-800/30 transition-all"
      >
        {loading ? 'Odesílám... (může trvat až minutu)' : 'Dokončit registraci'}
      </button>
    </form>
  );
}
