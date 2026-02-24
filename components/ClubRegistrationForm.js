// /components/ClubRegistrationForm.js – Registrace ON Club (samostatná, rozšiřitelná nezávisle na VIP)
import { useState } from "react";

export default function ClubRegistrationForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    gender: "Muž",
    age: "",
    height: "",
    weight: "",
    diet_type: "",
    dietary_restrictions: "",
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
        notes: form.notes?.trim() || null,
        program: 'ON_CLUB',
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
      <div className="text-center text-emerald-400 mt-10">
        <h3 className="text-2xl font-bold mb-2">✅ Registrace do ON Clubu dokončena!</h3>
        <p>Údaje byly uloženy a plán byl odeslán na e-mail. V e-mailu najdeš přihlašovací údaje – s nimi se můžeš přihlásit a vidět svůj profil.</p>
        <a href="/login" className="inline-block mt-6 text-emerald-400 underline hover:no-underline">Přihlásit se do profilu →</a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl mx-auto mt-10 p-10 bg-[#121212] rounded-2xl shadow-lg border border-[#222]"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <input
          name="name"
          placeholder="Jméno a příjmení"
          value={form.name}
          onChange={handleChange}
          required
          className="p-4 rounded-xl bg-[#0f0f0f] border border-gray-700 focus:ring-2 focus:ring-cyan-400 w-full text-white"
        />
        <input
          name="email"
          placeholder="E-mail"
          value={form.email}
          onChange={handleChange}
          required
          type="email"
          className="p-4 rounded-xl bg-[#0f0f0f] border border-gray-700 focus:ring-2 focus:ring-cyan-400 w-full text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
        <select
          name="gender"
          value={form.gender}
          onChange={handleChange}
          className="p-4 rounded-xl bg-[#0f0f0f] border border-gray-700 focus:ring-2 focus:ring-cyan-400 w-full text-white"
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
          className="p-4 rounded-xl bg-[#0f0f0f] border border-gray-700 focus:ring-2 focus:ring-cyan-400 w-full text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
        <input
          name="height"
          placeholder="Výška (cm)"
          value={form.height}
          onChange={handleChange}
          required
          className="p-4 rounded-xl bg-[#0f0f0f] border border-gray-700 focus:ring-2 focus:ring-cyan-400 w-full text-white"
        />
        <input
          name="weight"
          placeholder="Váha (kg)"
          value={form.weight}
          onChange={handleChange}
          required
          className="p-4 rounded-xl bg-[#0f0f0f] border border-gray-700 focus:ring-2 focus:ring-cyan-400 w-full text-white"
        />
      </div>

      <details className="mt-6 rounded-xl bg-[#0f0f0f] border-2 border-cyan-500/50 overflow-hidden group">
        <summary className="flex items-center justify-between gap-2 cursor-pointer list-none p-4 text-white font-bold text-base hover:bg-[#1a1a2e] select-none">
          <span>Strava a omezení (volitelné)</span>
          <span className="text-sm transition group-open:rotate-180" aria-hidden>▼</span>
        </summary>
        <div className="px-4 pb-4 pt-0 space-y-4 border-t border-gray-700">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Typ stravy (volitelné)</label>
            <select
              name="diet_type"
              value={form.diet_type}
              onChange={handleChange}
              className="p-4 w-full rounded-xl bg-[#0f0f0f] border border-gray-700 focus:ring-2 focus:ring-cyan-400 text-white"
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
              className="p-4 w-full rounded-xl bg-[#0f0f0f] border border-gray-700 focus:ring-2 focus:ring-cyan-400 text-white"
            />
          </div>
        </div>
      </details>

      {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-8 w-full py-4 bg-cyan-500 hover:bg-cyan-600 text-black font-semibold rounded-xl text-lg shadow-lg shadow-cyan-800/30 transition-all"
      >
        {loading ? 'Odesílám... (může trvat až minutu)' : 'Připojit se k ON Clubu'}
      </button>
    </form>
  );
}
