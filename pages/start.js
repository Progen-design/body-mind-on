import { useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";

export default function Start() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    gender: "",
    age: "",
    height: "",
    weight: "",
    activity: "",
    stress: "",
    worktype: "",
    goal: "",
    frequency: "",
    diet_type: "",
    dietary_restrictions: "",
    notes: "",
    program: "START",
  });

  const [status, setStatus] = useState("");

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
    if (formData.password && formData.password.length < 6) {
      setStatus("❌ Heslo musí mít alespoň 6 znaků.");
      return;
    }
    if (formData.password !== formData.passwordConfirm) {
      setStatus("❌ Hesla se neshodují.");
      return;
    }
    setStatus("⏳ Odesílám... (může trvat až minutu – generuje se plán a e-mail)");

    try {
      const cleanedData = normalizeData(formData);
      delete cleanedData.passwordConfirm;

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
          setStatus("✅ " + (result.message || "Údaje byly uloženy a plán byl odeslán na e-mail."));
        }
        setFormData({
          name: "",
          email: "",
          password: "",
          passwordConfirm: "",
          gender: "",
          age: "",
          height: "",
          weight: "",
          activity: "",
          stress: "",
          worktype: "",
          goal: "",
          frequency: "",
          diet_type: "",
          dietary_restrictions: "",
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

  return (
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

          {/* HESLO */}
          <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label block mb-2 text-gray-400">Heslo (min. 6 znaků)</label>
              <input
                name="password"
                type="password"
                className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
                value={formData.password}
                onChange={handleChange}
                placeholder="Zvol si heslo pro přístup do profilu"
                minLength={6}
                required
              />
            </div>
            <div>
              <label className="label block mb-2 text-gray-400">Heslo znovu</label>
              <input
                name="passwordConfirm"
                type="password"
                className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
                value={formData.passwordConfirm}
                onChange={handleChange}
                placeholder="Zadej heslo znovu"
                minLength={6}
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

          {/* STRAVA – rozbalovací sekce (důležité) */}
          <details className="group border border-sky-500/50 rounded-lg bg-[#0f0f0f] overflow-hidden">
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none p-3.5 text-white font-bold text-base hover:bg-[#1a1a2e] select-none">
              <span>Strava a omezení (volitelné)</span>
              <span className="text-sm transition group-open:rotate-180" aria-hidden>▼</span>
            </summary>
            <div className="px-3 pb-3 pt-0 space-y-4 border-t border-gray-700/50">
              <div>
                <label className="label block mb-2 text-gray-500 text-sm">Typ stravy (volitelné)</label>
                <select
                  name="diet_type"
                  className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
                  value={formData.diet_type}
                  onChange={handleChange}
                >
                  <option value="">Žádná preference</option>
                  <option value="vegetarian">Vegetarián</option>
                  <option value="vegan">Vegan</option>
                  <option value="gluten_free">Bez lepku</option>
                  <option value="lactose_free">Bez laktózy</option>
                  <option value="paleo">Paleo</option>
                  <option value="low_carb">Nízkosacharidová</option>
                  <option value="other">Jiné (popiš v poli Co nejí)</option>
                </select>
              </div>
              <div>
                <label className="label block mb-2 text-gray-500 text-sm">Co nejí – alergie, intolerance (volitelné)</label>
                <textarea
                  name="dietary_restrictions"
                  className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white"
                  rows="2"
                  value={formData.dietary_restrictions}
                  onChange={handleChange}
                  placeholder="např. ořechy, mléko, lepek…"
                />
              </div>
            </div>
          </details>

          {/* SUBMIT */}
          <button
            type="submit"
            className="submit w-full py-3 rounded-lg font-semibold text-lg text-white bg-gradient-to-r from-sky-500 to-sky-700 hover:opacity-90 transition"
          >
            Dokončit registraci
          </button>

          {status && <p className="center mt-4 text-lg text-gray-300">{status}</p>}
        </form>
      </main>
      <Footer />
    </>
  );
}
