<<<<<<< HEAD
import React from "react";
import BodyMetricsForm from "../components/BodyMetricsForm";
=======
import { useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";

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
    worktype: "",
    goal: "",
    frequency: "",
    notes: "",
    program: "START",
  });

  const [status, setStatus] = useState("");

  // 🔹 Pomocná funkce – sjednocení pomlček a formátování
  const normalizeData = (data) => {
    const cleaned = { ...data };
    cleaned.frequency = cleaned.frequency?.replace("–", "-") || "";
    cleaned.activity = cleaned.activity?.toLowerCase().trim();
    cleaned.stress = cleaned.stress?.toLowerCase().trim();
    cleaned.goal = cleaned.goal?.toLowerCase().trim();
    return cleaned;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("⏳ Odesílám... (může trvat až minutu – generuje se plán a e-mail)");

    try {
      const cleanedData = normalizeData(formData);

      const res = await fetch("/api/body-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedData),
      });

      let result;
      try {
        const text = await res.text();
        result = text ? JSON.parse(text) : {};
      } catch (_) {
        result = { error: res.ok ? "Neplatná odpověď serveru." : `Chyba ${res.status}` };
      }

      if (res.ok) {
        if (result.planSent === false) {
          setStatus("⚠️ " + (result.message || "Údaje uloženy, ale e-mail s plánem se nepodařilo odeslat. Zkontroluj spam nebo napiš na info@bodyandmindon.cz."));
        } else {
          const msg = result.message || "Údaje byly uloženy a plán byl odeslán na e-mail.";
          const appendLogin = result.loginUnavailable ? "" : " Do e-mailu ti přijde plán a přihlašovací údaje – s nimi se můžeš přihlásit a vidět svůj profil.";
          setStatus("✅ " + msg + appendLogin);
        }
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
        setStatus("❌ Chyba: " + (result.error || result.message || "Nepodařilo se odeslat."));
      }
    } catch (err) {
      setStatus("❌ Chyba připojení: " + (err.message || "Zkuste to znovu za chvíli."));
    }
  };
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d

  return (
<<<<<<< HEAD
    <div className="min-h-screen bg-gradient-to-b from-[#0b0121] via-[#1b0640] to-[#2a0a6e] text-white">
      {/* Hero Section */}
      <section className="flex flex-col md:flex-row items-center justify-center text-center md:text-left px-6 md:px-16 py-20 max-w-7xl mx-auto gap-10">
        {/* Text */}
        <div className="flex-1 start-animate">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-[#9b5cff] to-[#2ECC71] text-transparent bg-clip-text">
              Body & Mind ON
            </span>{" "}
            – Start program
          </h1>
          <p className="text-lg text-gray-300 mb-8 leading-relaxed max-w-lg">
            Získej svůj osobní <span className="text-[#2ECC71] font-semibold">AI plán</span> tréninku, jídelníčku a regenerace během pár minut.  
            Vše přizpůsobené tvým cílům – a první týden <span className="text-[#9b5cff] font-semibold">zcela zdarma.</span>
          </p>

          <a
            href="#formular"
            className="inline-block bg-[#2ECC71] text-black font-semibold text-lg px-10 py-4 rounded-full hover:bg-[#27AE60] transition-all transform hover:scale-105 shadow-lg"
          >
            💪 Začít zdarma
          </a>

          <p className="text-sm text-gray-400 mt-3">
            Bez závazků – první plán získáš okamžitě po vyplnění.
          </p>
        </div>

        {/* Ilustrace / AI vizual */}
        <div className="flex-1 flex justify-center start-animate-delay">
          <img
            src="https://cdn.jsdelivr.net/gh/janprikopa/assets/ai-fitness-dashboard.png"
            alt="AI dashboard illustration"
            className="w-[90%] md:w-[80%] drop-shadow-[0_0_30px_rgba(155,92,255,0.4)] rounded-3xl"
          />
        </div>
      </section>

      {/* Form Card */}
      <section
        id="formular"
        className="max-w-5xl mx-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-10 md:p-16 my-10 start-animate-up"
      >
        <h2 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-[#9b5cff] to-[#2ECC71] text-transparent bg-clip-text">
          Aktivuj svůj plán zdarma
        </h2>
        <p className="text-center text-gray-300 mb-10 max-w-2xl mx-auto">
          Vyplň jen pár údajů a naše AI ti během <span className="text-[#2ECC71]">2 minut</span> vytvoří osobní plán.  
          Plán ti přijde e-mailem a uloží se do tvého profilu.
        </p>
        <BodyMetricsForm submitLabel="Dokončit registraci" />
      </section>

      {/* CTA + Footer */}
      <div className="text-center mt-12 mb-10 start-animate-delay">
        <a
          href="#formular"
          className="bg-[#9b5cff] hover:bg-[#8a49e0] text-white font-semibold px-10 py-4 rounded-full transition-all transform hover:scale-105"
        >
          🚀 Spustit zdarma teď
        </a>
        <p className="text-gray-400 text-sm mt-4">
          Tvůj plán je připraven do 2 minut. Bez registrace, bez stresu.
        </p>
      </div>

      <style jsx global>{`
        @keyframes startFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .start-animate { animation: startFadeIn 0.8s ease-out forwards; }
        .start-animate-delay { animation: startFadeIn 0.8s ease-out 0.2s forwards; opacity: 0; }
        .start-animate-up { animation: startFadeIn 0.8s ease-out 0.4s forwards; opacity: 0; }
      `}</style>
=======
    <>
      <Header />
    <main className="container py-12 text-white">
      {/* HERO */}
      <section className="text-center mb-10">
        <h1 className="text-4xl font-extrabold mb-3 text-sky-400">
          START Program – Začni zdarma
        </h1>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto">
          Vyzkoušej systém bez rizika – AI ti zdarma připraví osobní plán tréninku, jídelníček i regeneraci.
        </p>
      </section>

      {/* FORM */}
      <form
        onSubmit={handleSubmit}
        className="max-w-3xl mx-auto bg-[#121212] p-8 rounded-2xl shadow-lg border border-[#222] space-y-6"
      >
        {/* OSOBNÍ ÚDAJE */}
        <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label block mb-2 text-gray-400">Jméno a příjmení</label>
            <input
              name="name"
              className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.name}
              onChange={handleChange}
              placeholder="Jan Novák"
              required
            />
          </div>
          <div>
            <label className="label block mb-2 text-gray-400">E-mail</label>
            <input
              name="email"
              type="email"
              className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.email}
              onChange={handleChange}
              placeholder="jan@example.com"
              required
            />
          </div>
        </div>

        {/* GENDER + AGE */}
        <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label block mb-2 text-gray-400">Pohlaví</label>
            <select
              name="gender"
              className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.gender}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="male">Muž</option>
              <option value="female">Žena</option>
            </select>
          </div>
          <div>
            <label className="label block mb-2 text-gray-400">Věk</label>
            <input
              name="age"
              type="number"
              className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.age}
              onChange={handleChange}
              placeholder="30"
              required
            />
          </div>
        </div>

        {/* BODY DATA */}
        <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label block mb-2 text-gray-400">Výška (cm)</label>
            <input
              name="height"
              type="number"
              className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.height}
              onChange={handleChange}
              placeholder="180"
              required
            />
          </div>
          <div>
            <label className="label block mb-2 text-gray-400">Váha (kg)</label>
            <input
              name="weight"
              type="number"
              className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.weight}
              onChange={handleChange}
              placeholder="80"
              required
            />
          </div>
        </div>

        {/* AKTIVITA + STRES */}
        <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label block mb-2 text-gray-400">Úroveň aktivity</label>
            <select
              name="activity"
              className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.activity}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="sedavy">Nízká</option>
              <option value="stredne">Střední</option>
              <option value="velmi">Vysoká</option>
            </select>
          </div>
          <div>
            <label className="label block mb-2 text-gray-400">Míra stresu</label>
            <select
              name="stress"
              className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.stress}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="low">Nízká</option>
              <option value="medium">Střední</option>
              <option value="high">Vysoká</option>
            </select>
          </div>
        </div>

        {/* JOB + GOAL */}
        <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label block mb-2 text-gray-400">Typ práce</label>
            <select
              name="worktype"
              className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.worktype}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="office_it">Kancelář / IT</option>
              <option value="manual">Manuální</option>
              <option value="kombinovana">Kombinovaná</option>
            </select>
          </div>
          <div>
            <label className="label block mb-2 text-gray-400">Cíl</label>
            <select
              name="goal"
              className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
              value={formData.goal}
              onChange={handleChange}
              required
            >
              <option value="">Vyber</option>
              <option value="redukce">Redukce hmotnosti</option>
              <option value="nabirani_svaly">Nárůst svalů</option>
              <option value="udrzovani">Zdravý životní styl</option>
            </select>
          </div>
        </div>

        {/* FREKVENCE */}
        <div>
          <label className="label block mb-2 text-gray-400">Frekvence cvičení</label>
          <select
            name="frequency"
            className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
            value={formData.frequency}
            onChange={(e) => {
              const cleanValue = e.target.value.replace("–", "-");
              setFormData({ ...formData, frequency: cleanValue });
            }}
            required
          >
            <option value="">Vyber</option>
            <option value="1-2x týdně">1–2x týdně</option>
            <option value="2-3x týdně">2–3x týdně</option>
            <option value="4-5x týdně">4–5x týdně</option>
          </select>
        </div>

        {/* POZNÁMKY */}
        <div>
          <label className="label block mb-2 text-gray-400">Poznámky (volitelné)</label>
          <textarea
            name="notes"
            className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
            rows="3"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Zdravotní omezení, preference jídel..."
          />
        </div>

        {/* SUBMIT */}
        <button
          type="submit"
          className="submit w-full py-3 rounded-lg font-semibold text-lg text-white bg-gradient-to-r from-sky-500 to-sky-700 hover:opacity-90 transition"
        >
          Dokončit registraci
        </button>
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d

        {status && <p className="center mt-4 text-lg text-gray-300">{status}</p>}
      </form>
    </main>
      <Footer />
    </>
  );
}
