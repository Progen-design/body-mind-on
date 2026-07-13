import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import Header from "../components/Header";
import Footer from "../components/Footer";
import HabitSelection from "../components/HabitSelection";
import SmartScaleChoiceField from "../components/SmartScaleChoiceField";
import TrainingEnvironmentFields from "../components/TrainingEnvironmentFields";
import { getSuggestedHabits } from "../lib/habits";
import { getFrequencyDayRange } from "../lib/preferenceConstants";
import { REGISTRATION_STEPS } from "../lib/registrationRules";
import { PLAN_GENERATION_DURATION_HINT, PLAN_GENERATION_OVERLAY_TITLE } from "../lib/planGenerationUiCopy";
import { validateBirthDate } from "../lib/bodyMetricsBirthDate";
import { trackProductEvent } from "../lib/productAnalytics";

// Registrace dle pravidel ON Club (stejný flow pro START, ON Club, VIP): https://app.bodyandmindon.cz/on-club
const MAX_STEP = REGISTRATION_STEPS;

export default function Start() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    gender: "",
    birth_date: "",
    height: "",
    weight: "",
    smart_scale_choice: "none",
    activity: "",
    stress: "",
    worktype: "",
    goal: "",
    frequency: "",
    workout_days: [],
    training_environment: "",
    available_equipment: [],
    diet_type: "",
    dietary_restrictions: "",
    foods_to_avoid: "",
    notes: "",
    program: "START",
  });

  const [status, setStatus] = useState("");
  const [planFailedWithAccount, setPlanFailedWithAccount] = useState(false);
  const [planFailedCanRetry, setPlanFailedCanRetry] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [selectedHabits, setSelectedHabits] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    trackProductEvent('onboarding_started', { program: 'START' }, { source: 'start_page', pagePath: '/start' });
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;
    const plan = String(router.query?.plan || '').toLowerCase();
    if (plan === 'club') {
      router.replace('/on-club');
      return;
    }
    if (plan === 'vip') {
      router.replace('/chci-vip');
    }
  }, [router.isReady, router.query?.plan, router]);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      router.replace('/profil');
    })();
    return () => { cancelled = true; };
  }, [router.isReady, router]);

  const normalizeData = (data) => {
    const cleaned = { ...data };
    cleaned.frequency = cleaned.frequency?.replace("–", "-") || "";
    cleaned.activity = cleaned.activity?.toLowerCase().trim();
    cleaned.stress = cleaned.stress?.toLowerCase().trim();
    cleaned.goal = cleaned.goal?.toLowerCase().trim();
    if (cleaned.training_environment !== 'home_equipment') {
      cleaned.available_equipment = [];
    } else if (!Array.isArray(cleaned.available_equipment)) {
      cleaned.available_equipment = [];
    }
    return cleaned;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (name === 'training_environment' && value !== 'home_equipment') {
      setFormData({ ...formData, [name]: value, available_equipment: [] });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  const getStep2Errors = () => {
    const errors = {};
    const birthCheck = validateBirthDate(formData.birth_date);
    if (!birthCheck.valid) {
      errors.birth_date = birthCheck.error;
    }
    const height = Number(formData.height);
    if (formData.height !== "" && (!Number.isFinite(height) || height < 100 || height > 250)) {
      errors.height = "Výška musí být mezi 100 a 250 cm.";
    }
    return errors;
  };

  const canProceedStep1 = () => {
    return formData.name?.trim() && formData.email?.trim() && formData.password?.length >= 6 && formData.password === formData.passwordConfirm;
  };
  const canProceedStep2 = () => {
    return formData.gender && formData.birth_date && formData.height && formData.weight;
  };
  const canProceedStep3 = () => {
    return formData.activity && formData.stress && formData.worktype && formData.goal && formData.frequency
      && formData.training_environment
      && Array.isArray(formData.workout_days) && formData.workout_days.length >= 1;
  };
  const canProceedStep5 = () => selectedHabits.length > 0;

  const suggestedHabits = useMemo(() => {
    return getSuggestedHabits({
      goal: formData.goal,
      stress_level: formData.stress,
      activity: formData.activity,
      dietary_restrictions: formData.dietary_restrictions,
      notes: formData.notes,
    });
  }, [formData.goal, formData.stress, formData.activity, formData.dietary_restrictions, formData.notes]);

  const handleNext = () => {
    setStatus("");
    setPlanFailedWithAccount(false);
    setPlanFailedCanRetry(false);
    if (step === 2) {
      const step2Errors = getStep2Errors();
      if (Object.keys(step2Errors).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...step2Errors }));
        return;
      }
    }
    if (step === 4 && selectedHabits.length === 0 && suggestedHabits.length > 0) {
      setSelectedHabits(suggestedHabits);
    }
    if (step < MAX_STEP) setStep((s) => s + 1);
  };

  const handleBack = () => {
    setStatus("");
    setPlanFailedWithAccount(false);
    setPlanFailedCanRetry(false);
    if (step > 1) setStep((s) => s - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const step2Errors = getStep2Errors();
    if (Object.keys(step2Errors).length > 0) {
      setFieldErrors(step2Errors);
      setStatus("");
      setStep(2);
      return;
    }
    if (formData.password && formData.password.length < 6) {
      setStatus("❌ Heslo musí mít alespoň 6 znaků.");
      return;
    }
    if (formData.password !== formData.passwordConfirm) {
      setStatus("❌ Hesla se neshodují.");
      return;
    }
    setIsSubmitting(true);
    setStatus("⏳ Odesílám registraci a připravuji účet…");

    try {
      const cleanedData = normalizeData(formData);
      delete cleanedData.passwordConfirm;

      const res = await fetch("/api/body-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cleanedData, selected_habits: selectedHabits }),
      });

      let result;
      try {
        const text = await res.text();
        result = text ? JSON.parse(text) : {};
      } catch (_) {
        result = { error: res.ok ? "Neplatná odpověď serveru." : `Chyba ${res.status}` };
      }

      if (res.ok) {
        if (result.plan_state === 'ready' || result.plan_state === 'processing') {
          setStatus("✅ " + (result.message || "Účet je vytvořen. Přesměrování na tvůj plán…"));
          setPlanFailedWithAccount(false);
          const doRedirect = async () => {
            if (cleanedData.password && cleanedData.email) {
              const { error } = await supabase.auth.signInWithPassword({
                email: cleanedData.email,
                password: cleanedData.password,
              });
              if (!error) {
                router.replace('/profil');
                return;
              }
            }
            router.replace(`/login?registered=1&email=${encodeURIComponent(cleanedData.email || '')}&redirect=/profil`);
          };
          setTimeout(doRedirect, 400);
          return;
        }
        setIsSubmitting(false);
        setStatus("⚠️ " + (result.message || "Údaje uloženy, ale e-mail s plánem se nepodařilo odeslat. Zkontroluj spam nebo napiš na info@bodyandmindon.cz."));
        setPlanFailedWithAccount(true);
      } else {
        setIsSubmitting(false);
        let nextError = result.error || result.message || "Nepodařilo se odeslat.";
        if (res.status === 504) {
          nextError = "Generování plánu trvalo příliš dlouho. Účet mohl být vytvořen – zkus se přihlásit. Plán může být už v profilu, nebo zkus registraci znovu za chvíli.";
          setPlanFailedWithAccount(true);
        }
        if (/Výška musí být mezi 100 a 250 cm\./i.test(nextError)) {
          setFieldErrors({ height: "Výška musí být mezi 100 a 250 cm." });
          setStatus("");
          setStep(2);
        } else {
          setStatus("❌ " + nextError);
          setPlanFailedCanRetry(result?.hasUserId === true);
        }
      }
    } catch (err) {
      setIsSubmitting(false);
      const msg = err?.message || "";
      const is504 = /504|timeout|timed out/i.test(msg);
      setStatus(is504
        ? "❌ Generování plánu trvalo příliš dlouho. Zkus se přihlásit – plán může být už v profilu, nebo zkus registraci znovu za chvíli."
        : "❌ Chyba připojení: " + (msg || "Zkuste to znovu za chvíli."));
    }
  };

  return (
    <>
      <Header />
      <main className="app-page container py-12 text-white">
        <div className="app-page-bg-decor" aria-hidden>
          <span className="app-page-bg-orb app-page-bg-orb--center" />
        </div>
        <section className="text-center mb-6">
          <h1 className="text-4xl font-extrabold mb-3 text-sky-400">
            START Program – Začni zdarma
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Vyzkoušej systém bez rizika – AI ti zdarma připraví osobní plán tréninku, jídelníček i regeneraci.
          </p>
        </section>

        <div className="max-w-3xl mx-auto mb-6 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-center">
          <p className="text-gray-200 text-sm md:text-base">
            Už máš účet?{' '}
            <Link href="/login?redirect=/profil" className="text-sky-400 font-semibold hover:underline">
              Přihlas se a otevři svůj plán
            </Link>
          </p>
        </div>

        {/* Progress bar */}
        <div className="progress-bar-wrap max-w-3xl mx-auto mb-8">
            <div className="progress-dots">
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} className={s === step ? "active" : s < step ? "done" : ""} aria-hidden>
                  {s}
                </span>
              ))}
            </div>
            <p className="progress-label">Krok {step} z {MAX_STEP}</p>
          </div>

        <form
          onSubmit={step < MAX_STEP ? (e) => { e.preventDefault(); handleNext(); } : handleSubmit}
          className="reg-form reg-form-card max-w-3xl mx-auto space-y-6"
          aria-busy={isSubmitting}
          style={{ position: "relative" }}
        >
          {isSubmitting && (
            <div className="reg-form-overlay" aria-hidden>
              <p className="reg-form-overlay-text">{PLAN_GENERATION_OVERLAY_TITLE}</p>
              <p className="reg-form-overlay-sub">{PLAN_GENERATION_DURATION_HINT}</p>
            </div>
          )}
          {/* KROK 1: Jméno, e-mail, hesla */}
          {step === 1 && (
            <>
              <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="reg-label">Jméno a příjmení</label>
                  <input name="name" className="reg-input" value={formData.name} onChange={handleChange} placeholder="Jan Novák" required disabled={isSubmitting} />
                </div>
                <div>
                  <label className="reg-label">E-mail</label>
                  <input name="email" type="email" className="reg-input" value={formData.email} onChange={handleChange} placeholder="jan@example.com" required disabled={isSubmitting} />
                </div>
              </div>
              <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="reg-label">Heslo (min. 6 znaků)</label>
                  <input name="password" type="password" className="reg-input" value={formData.password} onChange={handleChange} placeholder="Zvol si heslo pro přístup do profilu" minLength={6} required disabled={isSubmitting} />
                  <p className="text-sm text-gray-400 mt-1">Alespoň 6 znaků; lépe kombinace písmen a číslic.</p>
                </div>
                <div>
                  <label className="reg-label">Heslo znovu</label>
                  <input name="passwordConfirm" type="password" className="reg-input" value={formData.passwordConfirm} onChange={handleChange} placeholder="Zadej heslo znovu" minLength={6} required disabled={isSubmitting} />
                </div>
              </div>
            </>
          )}

          {/* KROK 2: Pohlaví, datum narození, výška, váha */}
          {step === 2 && (
            <div className="row grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="reg-label">Pohlaví</label>
                <select name="gender" className="reg-input" value={formData.gender} onChange={handleChange} required disabled={isSubmitting}>
                  <option value="">Vyber</option>
                  <option value="male">Muž</option>
                  <option value="female">Žena</option>
                </select>
              </div>
              <div>
                <label className="reg-label">Datum narození</label>
                <input
                  name="birth_date"
                  type="date"
                  className="reg-input"
                  value={formData.birth_date}
                  onChange={handleChange}
                  required
                  max={new Date().toISOString().split('T')[0]}
                  disabled={isSubmitting}
                />
                {fieldErrors.birth_date && <p className="reg-field-error" role="alert">{fieldErrors.birth_date}</p>}
              </div>
              <div>
                <label className="reg-label">Výška (cm)</label>
                <input name="height" type="number" className="reg-input" value={formData.height} onChange={handleChange} placeholder="180" required disabled={isSubmitting} />
                {fieldErrors.height && <p className="reg-field-error" role="alert">{fieldErrors.height}</p>}
              </div>
              <div>
                <label className="reg-label">Váha (kg)</label>
                <input name="weight" type="number" className="reg-input" value={formData.weight} onChange={handleChange} placeholder="80" required disabled={isSubmitting} />
              </div>
              <SmartScaleChoiceField
                value={formData.smart_scale_choice}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* KROK 3: Aktivita, stres, typ práce, cíl, frekvence */}
          {step === 3 && (
            <div className="step3-grid">
              <div className="step3-field">
                <label className="step3-label">Úroveň aktivity</label>
                <p className="step3-hint">Pomůže nám nastavit denní kalorie a intenzitu tréninku.</p>
                <select name="activity" className="step3-select reg-input" value={formData.activity} onChange={handleChange} required disabled={isSubmitting}>
                  <option value="">Vyber</option>
                  <option value="sedavy">Nízká</option>
                  <option value="stredne">Střední</option>
                  <option value="velmi">Vysoká</option>
                </select>
              </div>
              <div className="step3-field">
                <label className="step3-label">Míra stresu</label>
                <p className="step3-hint step3-hint-empty" aria-hidden> </p>
                <select name="stress" className="step3-select reg-input" value={formData.stress} onChange={handleChange} required disabled={isSubmitting}>
                  <option value="">Vyber</option>
                  <option value="low">Nízká</option>
                  <option value="medium">Střední</option>
                  <option value="high">Vysoká</option>
                </select>
              </div>
              <div className="step3-field">
                <label className="step3-label">Typ práce</label>
                <p className="step3-hint step3-hint-empty" aria-hidden> </p>
                <select name="worktype" className="step3-select reg-input" value={formData.worktype} onChange={handleChange} required disabled={isSubmitting}>
                  <option value="">Vyber</option>
                  <option value="office_it">Sedavé zaměstnání</option>
                  <option value="manual">Aktivní zaměstnání</option>
                  <option value="teacher_sales">Kombinované</option>
                </select>
              </div>
              <div className="step3-field">
                <label className="step3-label">Cíl</label>
                <p className="step3-hint">Podle cíle upravíme kalorie a makra (redukce / udržení / nárůst).</p>
                <select name="goal" className="step3-select reg-input" value={formData.goal} onChange={handleChange} required disabled={isSubmitting}>
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
                  className="step3-select reg-input"
                  value={formData.frequency}
                  onChange={(e) => {
                    const freq = e.target.value.replace("–", "-");
                    const { max } = getFrequencyDayRange(freq);
                    const trimmed = Array.isArray(formData.workout_days)
                      ? formData.workout_days.slice(0, max)
                      : [];
                    setFormData({ ...formData, frequency: freq, workout_days: trimmed });
                  }}
                  required
                  disabled={isSubmitting}
                >
                  <option value="">Vyber</option>
                  <option value="1-2x týdně">1–2x týdně</option>
                  <option value="2-3x týdně">2–3x týdně</option>
                  <option value="4-5x týdně">4–5x týdně</option>
                </select>
              </div>
              <div className="step3-field step3-field-full">
                <TrainingEnvironmentFields
                  trainingEnvironment={formData.training_environment}
                  availableEquipment={formData.available_equipment}
                  disabled={isSubmitting}
                  showErrors={!formData.training_environment}
                  onTrainingEnvironmentChange={(value) =>
                    setFormData((f) => ({
                      ...f,
                      training_environment: value,
                      available_equipment: value === 'home_equipment' ? f.available_equipment : [],
                    }))
                  }
                  onAvailableEquipmentChange={(equipment) =>
                    setFormData((f) => ({ ...f, available_equipment: equipment }))
                  }
                />
              </div>
              <div className="step3-field step3-field-full">
                <label className="step3-label">Cvičím v tyto dny</label>
                <p className="step3-hint">Vyber dny, kdy chceš mít trénink v plánu – počet by měl odpovídat frekvenci (1–2× = 1–2 dny, 2–3× = 2–3 dny, 4–5× = 4–5 dní). Ostatní dny budou odpočinek nebo lehká procházka.</p>
                <div className="reg-workout-days">
                  {[{ v: 1, label: "Po" }, { v: 2, label: "Út" }, { v: 3, label: "St" }, { v: 4, label: "Čt" }, { v: 5, label: "Pá" }, { v: 6, label: "So" }, { v: 0, label: "Ne" }].map(({ v, label }) => (
                    <label key={v} className="reg-workout-day-check">
                      <input
                        type="checkbox"
                        checked={formData.workout_days.includes(v)}
                        disabled={isSubmitting}
                        onChange={(e) => {
                          const { max } = getFrequencyDayRange(formData.frequency);
                          const next = e.target.checked
                            ? (formData.workout_days.length >= max
                              ? formData.workout_days
                              : [...formData.workout_days, v].sort((a, b) => a - b))
                            : formData.workout_days.filter((d) => d !== v);
                          setFormData((f) => ({ ...f, workout_days: next }));
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                {Array.isArray(formData.workout_days) && formData.workout_days.length === 0 && (
                  <p className="step3-hint step3-hint-error" role="alert">Vyber alespoň jeden den pro trénink.</p>
                )}
              </div>
            </div>
          )}

          {/* KROK 4: Strava a omezení (volitelné) */}
          {step === 4 && (
            <div className="diet-section">
              <div className="diet-section-header">
                <span className="diet-section-icon">🥗</span>
                <div>
                  <h3 className="diet-section-title">Strava a omezení (volitelné)</h3>
                  <p className="diet-section-desc">Abychom do jídelníčku nezařadili to, co nejíš.</p>
                </div>
              </div>
              <div className="diet-section-body">
                <div>
                  <label className="reg-label">Typ stravy (volitelné)</label>
                  <select name="diet_type" className="reg-input" value={formData.diet_type} onChange={handleChange} disabled={isSubmitting}>
                    <option value="">Žádná preference</option>
                    <option value="vegetarian">Vegetarián</option>
                    <option value="vegan">Vegan</option>
                    <option value="gluten_free">Bez lepku</option>
                    <option value="lactose_free">Bez laktózy</option>
                    <option value="paleo">Paleo</option>
                    <option value="low_carb">Nízkosacharidová</option>
                    <option value="other">Jiné (popiš v poli Zdravotní omezení)</option>
                  </select>
                </div>
                <div>
                  <label className="reg-label">Zdravotní omezení – alergie, intolerance (volitelné)</label>
                  <textarea name="dietary_restrictions" className="reg-input" rows="2" value={formData.dietary_restrictions} onChange={handleChange} placeholder="např. ořechy, mléko, lepek – kvůli bezpečnosti jídelníčku" disabled={isSubmitting} />
                  <p className="text-sm text-gray-400 mt-1 mb-0">Důležité pro zdraví; do plánu nepatří potraviny, které ti škodí.</p>
                </div>
                <div>
                  <label className="reg-label">Potraviny, které nechceš v plánu – chuť, zvyk (volitelné)</label>
                  <textarea name="foods_to_avoid" className="reg-input" rows="2" value={formData.foods_to_avoid} onChange={handleChange} placeholder="např. brokolice, avokádo – co neješ, i když nejsi alergický/á" disabled={isSubmitting} />
                  <p className="text-sm text-gray-400 mt-1 mb-0">Úprava jen podle preferencí, ne jako lékařské omezení.</p>
                </div>
              </div>
            </div>
          )}

          {/* KROK 5: Výběr návyků */}
          {step === 5 && (
            <div className="habit-step">
              <h3 className="habit-step-title">Vyber si návyky k sledování</h3>
              <HabitSelection
                selectedIds={selectedHabits}
                suggestedIds={suggestedHabits}
                onChange={setSelectedHabits}
                disabled={isSubmitting}
              />
              {selectedHabits.length === 0 && (
                <p className="habit-step-hint">Vyber alespoň jeden návyk pro pokračování.</p>
              )}
            </div>
          )}

          <div className="form-actions">
            {step > 1 ? (
              <button type="button" onClick={handleBack} className="btn-back" disabled={isSubmitting}>
                Zpět
              </button>
            ) : (
              <span />
            )}
            {step < MAX_STEP ? (
              <button
                type="submit"
                className="btn-submit"
                disabled={
                  isSubmitting ||
                  (step === 1 && !canProceedStep1()) ||
                  (step === 2 && !canProceedStep2()) ||
                  (step === 3 && !canProceedStep3()) ||
                  (step === 5 && !canProceedStep5())
                }
              >
                Pokračovat
              </button>
            ) : (
              <button type="submit" className="btn-submit btn-submit-large" disabled={isSubmitting}>
                {isSubmitting ? "Generuji plán…" : "Dokončit registraci"}
              </button>
            )}
          </div>

          {status && <p className="center mt-4 text-lg text-gray-300">{status}</p>}
          {planFailedWithAccount && formData.email && (
            <p className="center mt-3">
              <a href={`/login?registered=1&email=${encodeURIComponent(formData.email)}&redirect=/profil`} className="btn-submit inline-block">
                Přihlásit se a nechat si znovu poslat plán na e-mail
              </a>
            </p>
          )}
          {planFailedCanRetry && formData.email && formData.password && (
            <p className="center mt-3">
              <button
                type="button"
                className="btn-submit"
                onClick={async () => {
                  const { error } = await supabase.auth.signInWithPassword({
                    email: formData.email,
                    password: formData.password,
                  });
                  if (!error) router.replace('/profil');
                  else router.replace(`/login?registered=1&email=${encodeURIComponent(formData.email)}&redirect=/profil`);
                }}
              >
                Přihlásit se a zkusit znovu v profilu
              </button>
            </p>
          )}
          {planFailedCanRetry && formData.email && !formData.password && (
            <p className="center mt-3">
              <a href={`/login?registered=1&email=${encodeURIComponent(formData.email)}&redirect=/profil`} className="btn-submit inline-block">
                Přihlásit se a zkusit znovu v profilu
              </a>
            </p>
          )}
        </form>

      </main>
      <Footer />

      <style jsx>{`
        .role-cards-wrap {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          max-width: 720px;
          margin: 0 auto;
          align-items: stretch;
        }
        @media (max-width: 768px) {
          .role-cards-wrap { grid-template-columns: 1fr; max-width: 360px; }
        }
        .role-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          min-height: 160px;
          padding: 20px 16px;
          border-radius: 16px;
          border: 2px solid #475569;
          background: #121212;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          text-decoration: none;
          color: inherit;
          font: inherit;
          box-sizing: border-box;
          position: relative;
        }
        button.role-card, a.role-card { margin: 0; }
        .role-card:hover {
          border-color: #0ea5e9;
          background: #1a1a2e;
          box-shadow: 0 4px 20px rgba(14, 165, 233, 0.15);
        }
        .role-card-onclub:hover {
          border-color: #f59e0b;
          box-shadow: 0 4px 20px rgba(245, 158, 11, 0.2);
        }
        .role-card-vip:hover {
          border-color: #eab308;
          box-shadow: 0 4px 20px rgba(234, 179, 8, 0.2);
        }
        .role-card-recommended {
          border-color: rgba(139, 92, 255, 0.6);
          background: rgba(30, 27, 75, 0.5);
          box-shadow: 0 0 0 1px rgba(139, 92, 255, 0.3), 0 4px 20px rgba(139, 92, 255, 0.15);
        }
        .role-card-recommended:hover {
          border-color: #a78bfa;
          background: rgba(49, 46, 129, 0.6);
          box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.4), 0 6px 24px rgba(139, 92, 255, 0.25);
        }
        .role-badge {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 20px;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
        }
        .role-emoji { font-size: 2rem; margin-bottom: 8px; }
        .role-title { display: block; font-size: 1.15rem; margin-bottom: 6px; color: #e2e8f0; }
        .role-desc { font-size: 0.85rem; color: #94a3b8; margin: 0; line-height: 1.45; }
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
        .step3-hint-error { color: #f87171; margin-top: 6px; }
        .step3-select { width: 100%; margin-top: auto; }
        .reg-workout-days { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 8px; }
        .reg-workout-day-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; color: #e2e8f0; margin: 0; }
        .reg-workout-day-check input { width: 18px; height: 18px; accent-color: #7c3aed; }
        .reg-field-error { margin: 6px 0 0; font-size: 13px; color: #f87171; }

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
        .habit-step { margin-bottom: 0; }
        .habit-step-title { margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #e2e8f0; }
        .habit-step-hint { margin: 12px 0 0; font-size: 13px; color: #f87171; }
        .diet-section {
          margin-bottom: 24px;
          border-radius: 14px;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(6, 78, 59, 0.06) 100%);
          border: 1px solid rgba(14, 165, 233, 0.35);
          box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.1), 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        .diet-section-header {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 18px 20px;
          background: rgba(14, 165, 233, 0.06);
          border-bottom: 1px solid rgba(14, 165, 233, 0.2);
        }
        .diet-section-icon { font-size: 28px; line-height: 1; }
        .diet-section-title { margin: 0; font-size: 1.1rem; font-weight: 700; color: #38bdf8; letter-spacing: -0.02em; }
        .diet-section-desc { margin: 4px 0 0; font-size: 13px; color: #94a3b8; line-height: 1.4; }
        .diet-section-body { padding: 20px; }
        .diet-section-body > div { margin-bottom: 16px; }
        .diet-section-body > div:last-child { margin-bottom: 0; }
        .diet-section-body .reg-label { color: #94a3b8; }
        .reg-form-overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 10, 15, 0.7);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 24px;
          border-radius: inherit;
          pointer-events: none;
        }
        .reg-form-overlay-text {
          font-size: 15px;
          font-weight: 500;
          color: #94a3b8;
          margin: 0;
        }
      `}</style>
    </>
  );
}
