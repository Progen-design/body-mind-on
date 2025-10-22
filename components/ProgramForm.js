import { useState } from "react";

export default function ProgramForm({ planType }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    gender: "Muž",
    age: "",
    height: "",
    weight: "",
    activity: "Středně aktivní",
    stress_level: "Střední",
    occupation: "Kancelář / IT",
    goal: "Redukce hmotnosti",
    freq_choice: "2–3× týdně",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/assistant-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, planType }),
      });
      const data = await res.json();
      if (data.success) setSuccess(true);
      else alert("Nastala chyba při odeslání formuláře.");
    } catch (err) {
      alert("Chyba připojení: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success)
    return (
      <div className="text-center text-green-400 mt-10">
        <h3 className="text-2xl font-bold mb-2">✅ Plán odeslán!</h3>
        <p>Tvůj osobní plán ti dorazí e-mailem během pár minut.</p>
      </div>
    );

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl mx-auto mt-10 p-8 bg-neutral-900/80 rounded-2xl shadow-2xl border border-neutral-800 backdrop-blur"
    >
      <h3 className="text-2xl font-bold mb-8 text-green-400">
        Vyplň své údaje 👇
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          name="name"
          placeholder="Jméno a příjmení"
          value={form.name}
          onChange={handleChange}
          className="p-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
        <input
          name="email"
          placeholder="E-mail"
          value={form.email}
          onChange={handleChange}
          className="p-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <select
          name="gender"
          value={form.gender}
          onChange={handleChange}
          className="p-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        >
          <option>👨 Muž</option>
          <option>👩 Žena</option>
        </select>
        <input
          name="age"
          placeholder="Věk"
          value={form.age}
          onChange={handleChange}
          className="p-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <input
          name="height"
          placeholder="Výška (cm)"
          value={form.height}
          onChange={handleChange}
          className="p-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
        <input
          name="weight"
          placeholder="Váha (kg)"
          value={form.weight}
          onChange={handleChange}
          className="p-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
        />
      </div>

      <textarea
        name="notes"
        placeholder="Poznámky (volitelné)"
        value={form.notes}
        onChange={handleChange}
        className="p-3 mt-6 rounded-xl bg-neutral-800 border border-neutral-700 focus:ring-2 focus:ring-green-400 w-full"
      />

      <button
        type="submit"
        disabled={loading}
        className="mt-8 w-full py-4 bg-green-500 hover:bg-green-600 text-black font-semibold rounded-xl text-lg shadow-lg shadow-green-800/30 transition-all"
      >
        {loading ? "Odesílám..." : "Dokončit registraci"}
      </button>
    </form>
  );
}
