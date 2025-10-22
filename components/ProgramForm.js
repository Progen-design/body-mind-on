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
      className="max-w-3xl mx-auto mt-10 p-8 bg-neutral-900/90 rounded-2xl shadow-lg backdrop-blur border border-gray-800 text-white"
    >
      <h2 className="text-2xl font-bold text-center mb-6">
        Detaily pro <span className="text-blue-400">{planType}</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          name="name"
          placeholder="Jméno a příjmení"
          value={form.name}
          onChange={handleChange}
          className="p-3 rounded bg-neutral-800 border border-gray-700 w-full"
        />
        <input
          name="email"
          placeholder="E-mail"
          value={form.email}
          onChange={handleChange}
          className="p-3 rounded bg-neutral-800 border border-gray-700 w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <select
          name="gender"
          value={form.gender}
          onChange={handleChange}
          className="p-3 rounded bg-neutral-800 border border-gray-700 w-full"
        >
          <option>Muž</option>
          <option>Žena</option>
        </select>
        <input
          name="age"
          placeholder="Věk"
          value={form.age}
          onChange={handleChange}
          className="p-3 rounded bg-neutral-800 border border-gray-700 w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <input
          name="height"
          placeholder="Výška (cm)"
          value={form.height}
          onChange={handleChange}
          className="p-3 rounded bg-neutral-800 border border-gray-700 w-full"
        />
        <input
          name="weight"
          placeholder="Váha (kg)"
          value={form.weight}
          onChange={handleChange}
          className="p-3 rounded bg-neutral-800 border border-gray-700 w-full"
        />
      </div>

      <textarea
        name="notes"
        placeholder="Poznámky (volitelné)"
        value={form.notes}
        onChange={handleChange}
        className="p-3 mt-4 rounded bg-neutral-800 border border-gray-700 w-full"
      />

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full bg-[#00A8FF] hover:bg-[#0090DD] text-white font-semibold py-3 rounded-lg transition"
      >
        {loading ? "Odesílám..." : "Dokončit registraci"}
      </button>
    </form>
  );
}
