import { useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";

const MAX_STEP = 4;

export default function Start() {
  const [step, setStep] = useState(1);
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

  const canProceedStep1 = () => {
    return formData.name?.trim() && formData.email?.trim() && formData.password?.length >= 6 && formData.password === formData.passwordConfirm;
  };
  const canProceedStep2 = () => {
    return formData.gender && formData.age && formData.height && formData.weight;
  };
  const canProceedStep3 = () => {
    return formData.activity && formData.stress && formData.worktype && formData.goal && formData.frequency;
  };

  const handleNext = () => {
    if (step < MAX_STEP) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
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
        setStep(1);
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
        <section className="text-center mb-10">
          <h1 className="text-4xl font-extrabold mb-3 text-sky-400">
            START Program – Začni zdarma
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Vyzkoušej systém bez rizika – AI ti zdarma připraví osobní plán tréninku, jídelníček i regeneraci.
          </p>
        </section>

        {/* Progress bar */}
        <div className="progress-bar-wrap max-w-3xl mx-auto mb-8">
          <div className="progress-dots">
            {[1, 2, 3, 4].map((s) => (
              <span key={s} className={s === step ? "active" : s < step ? "done" : ""} aria-hidden>
                {s}
              </span>
            ))}
          </div>
          <p className="progress-label">Krok {step} z {MAX_STEP}</p>
        </div>

        <form
          onSubmit={step < MAX_STEP ? (e) => { e.preventDefault(); handleNext(); } : handleSubmit}
          className="max-w-3xl mx-auto bg-[#121212] p-8 rounded-2xl shadow-lg border border-[#222] space-y-6"
        >
          {/* KROK 1: Jméno, e-mail, hesla */}
          {step === 1 && (
            <>
              <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="label block mb-2 text-gray-400">Jméno a příjmení</label>
                  <input name="name" className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.name} onChange={handleChange} placeholder="Jan Novák" required />
                </div>
                <div>
                  <label className="label block mb-2 text-gray-400">E-mail</label>
                  <input name="email" type="email" className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.email} onChange={handleChange} placeholder="jan@example.com" required />
                </div>
              </div>
              <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="label block mb-2 text-gray-400">Heslo (min. 6 znaků)</label>
                  <input name="password" type="password" className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.password} onChange={handleChange} placeholder="Zvol si heslo pro přístup do profilu" minLength={6} required />
                </div>
                <div>
                  <label className="label block mb-2 text-gray-400">Heslo znovu</label>
                  <input name="passwordConfirm" type="password" className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.passwordConfirm} onChange={handleChange} placeholder="Zadej heslo znovu" minLength={6} required />
                </div>
              </div>
            </>
          )}

          {/* KROK 2: Pohlaví, věk, výška, váha */}
          {step === 2 && (
            <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label block mb-2 text-gray-400">Pohlaví</label>
                <select name="gender" className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.gender} onChange={handleChange} required>
                  <option value="">Vyber</option>
                  <option value="male">Muž</option>
                  <option value="female">Žena</option>
                </select>
              </div>
              <div>
                <label className="label block mb-2 text-gray-400">Věk</label>
                <input name="age" type="number" className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.age} onChange={handleChange} placeholder="30" required />
              </div>
              <div>
                <label className="label block mb-2 text-gray-400">Výška (cm)</label>
                <input name="height" type="number" className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.height} onChange={handleChange} placeholder="180" required />
              </div>
              <div>
                <label className="label block mb-2 text-gray-400">Váha (kg)</label>
                <input name="weight" type="number" className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.weight} onChange={handleChange} placeholder="80" required />
              </div>
            </div>
          )}

          {/* KROK 3: Aktivita, stres, typ práce, cíl, frekvence */}
          {step === 3 && (
            <div className="step3-grid">
              <div className="step3-field">
                <label className="step3-label">Úroveň aktivity</label>
                <p className="step3-hint">Pomůže nám nastavit denní kalorie a intenzitu tréninku.</p>
                <select name="activity" className="step3-select" value={formData.activity} onChange={handleChange} required>
                  <option value="">Vyber</option>
                  <option value="sedavy">Nízká</option>
                  <option value="stredne">Střední</option>
                  <option value="velmi">Vysoká</option>
                </select>
              </div>
              <div className="step3-field">
                <label className="step3-label">Míra stresu</label>
                <p className="step3-hint step3-hint-empty" aria-hidden> </p>
                <select name="stress" className="step3-select" value={formData.stress} onChange={handleChange} required>
                  <option value="">Vyber</option>
                  <option value="low">Nízká</option>
                  <option value="medium">Střední</option>
                  <option value="high">Vysoká</option>
                </select>
              </div>
              <div className="step3-field">
                <label className="step3-label">Typ práce</label>
                <p className="step3-hint step3-hint-empty" aria-hidden> </p>
                <select name="worktype" className="step3-select" value={formData.worktype} onChange={handleChange} required>
                  <option value="">Vyber</option>
                  <option value="office_it">Kancelář / IT</option>
                  <option value="manual">Manuální</option>
                  <option value="kombinovana">Kombinovaná</option>
                </select>
              </div>
              <div className="step3-field">
                <label className="step3-label">Cíl</label>
                <p className="step3-hint">Podle cíle upravíme kalorie a makra (redukce / udržení / nárůst).</p>
                <select name="goal" className="step3-select" value={formData.goal} onChange={handleChange} required>
                  <option value="">Vyber</option>
                  <option value="redukce">Redukce hmotnosti</option>
                  <option value="nabirani_svaly">Nárůst svalů</option>
                  <option value="udrzovani">Zdravý životní styl</option>
                </select>
              </div>
              <div className="step3-field step3-field-full">
                <label className="step3-label">Frekvence cvičení</label>
                <p className="step3-hint step3-hint-empty" aria-hidden> </p>
                <select
                  name="frequency"
                  className="step3-select"
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value.replace("–", "-") })}
                  required
                >
                  <option value="">Vyber</option>
                  <option value="1-2x týdně">1–2x týdně</option>
                  <option value="2-3x týdně">2–3x týdně</option>
                  <option value="4-5x týdně">4–5x týdně</option>
                </select>
              </div>
            </div>
          )}

          {/* KROK 4: Strava a omezení (volitelné) + „proč“ */}
          {step === 4 && (
            <details open className="group border border-sky-500/50 rounded-lg bg-[#0f0f0f] overflow-hidden">
              <summary className="flex items-center justify-between gap-2 cursor-pointer list-none p-3.5 text-white font-bold text-base hover:bg-[#1a1a2e] select-none">
                <span>Strava a omezení (volitelné)</span>
                <span className="text-sm transition group-open:rotate-180" aria-hidden>▼</span>
              </summary>
              <p className="text-xs text-gray-500 px-3.5 pb-2">Abychom do jídelníčku nezařadili to, co nejíš.</p>
              <div className="px-3 pb-3 pt-0 space-y-4 border-t border-gray-700/50">
                <div>
                  <label className="label block mb-2 text-gray-500 text-sm">Typ stravy (volitelné)</label>
                  <select name="diet_type" className="select w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" value={formData.diet_type} onChange={handleChange}>
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
                  <textarea name="dietary_restrictions" className="input w-full p-3 rounded-lg bg-[#0f0f0f] border border-gray-700 text-white" rows="2" value={formData.dietary_restrictions} onChange={handleChange} placeholder="např. ořechy, mléko, lepek…" />
                </div>
              </div>
            </details>
          )}

          <div className="form-actions">
            {step > 1 ? (
              <button type="button" onClick={handleBack} className="btn-back">
                Zpět
              </button>
            ) : (
              <span />
            )}
            {step < MAX_STEP ? (
              <button
                type="submit"
                className="btn-submit"
                disabled={step === 1 && !canProceedStep1() || step === 2 && !canProceedStep2() || step === 3 && !canProceedStep3()}
              >
                Pokračovat
              </button>
            ) : (
              <button type="submit" className="btn-submit btn-submit-large">
                Dokončit registraci
              </button>
            )}
          </div>

          {status && <p className="center mt-4 text-lg text-gray-300">{status}</p>}
        </form>
      </main>
      <Footer />

      <style jsx>{`
        .progress-bar-wrap { text-align: center; }
        .progress-dots { display: flex; justify-content: center; gap: 12px; margin-bottom: 8px; }
        .progress-dots span {
          width: 32px; height: 32px; line-height: 32px; border-radius: 50%;
          background: rgba(255,255,255,0.1); color: #94a3b8; font-size: 14px; font-weight: 600;
        }
        .progress-dots span.active { background: #0ea5e9; color: #fff; }
        .progress-dots span.done { background: #22c55e; color: #fff; }
        .progress-label { font-size: 13px; color: #64748b; margin: 0; }

        .step3-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px 32px;
        }
        @media (max-width: 640px) {
          .step3-grid { grid-template-columns: 1fr; }
        }
        .step3-field {
          display: flex;
          flex-direction: column;
          min-height: 88px;
        }
        .step3-field-full { grid-column: 1 / -1; }
        .step3-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #94a3b8;
          margin-bottom: 4px;
        }
        .step3-hint {
          font-size: 12px;
          color: #64748b;
          margin: 0 0 8px;
          line-height: 1.4;
          min-height: 16px;
        }
        .step3-hint-empty { visibility: hidden; margin-bottom: 8px; }
        .step3-select {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          background: #0f0f0f;
          border: 1px solid #374151;
          color: #fff;
          font-size: 15px;
          margin-top: auto;
        }
        .step3-select:focus {
          outline: none;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
        }

        .form-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-top: 28px;
          margin-top: 8px;
          border-top: 1px solid #222;
        }
        .btn-back {
          padding: 12px 24px;
          border-radius: 10px;
          border: 1px solid #4b5563;
          background: transparent;
          color: #d1d5db;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .btn-back:hover {
          background: #1a1a1a;
          border-color: #6b7280;
        }
        .btn-submit {
          padding: 12px 28px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .btn-submit:hover:not(:disabled) { opacity: 0.9; }
        .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-submit-large { padding: 14px 32px; font-size: 16px; }
      `}</style>
    </>
  );
}
