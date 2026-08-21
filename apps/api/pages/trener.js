// /pages/trener.js – Registrace trenéra (jednodušší než klient: jméno, e-mail, heslo)
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { supabase } from "../lib/supabaseClient";

export default function Trener() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/profil");
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    if (password.length < 6) {
      setMessage("Heslo musí mít alespoň 6 znaků.");
      return;
    }
    if (password !== passwordConfirm) {
      setMessage("Hesla se neshodují.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { name: name.trim() || null },
        },
      });
      if (error) throw error;
      setSuccess(true);
      setMessage("Účet byl vytvořen. Přihlas se e-mailem a heslem níže.");
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("already registered") || msg.includes("already exists")) {
        setMessage("Tento e-mail je už zaregistrovaný. Přihlas se nebo obnov heslo.");
      } else {
        setMessage(msg || "Registrace se nepodařila.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="app-page container py-12 text-white">
        <section className="trener-hero text-center mb-10">
          <h1 className="trener-title">Registrace pro trenéry</h1>
          <p className="trener-lead">
            Jako trenér můžeš v aplikaci přidávat plánované tréninky, propojit kalendář (info@) a vést klienty. Po registraci se přihlas a v profilu propoj Google Kalendář (Admin → Propojit kalendář).
          </p>
        </section>

        <div className="trener-form-wrap">
          {success ? (
            <div className="trener-success-card">
              <p className="trener-success-text">Účet byl vytvořen.</p>
              <Link href="/login" className="trener-btn trener-btn-primary">
                Přihlásit se
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="trener-form">
              <div className="trener-field">
                <label className="trener-label">Jméno a příjmení</label>
                <input
                  type="text"
                  className="trener-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jan Novák"
                />
              </div>
              <div className="trener-field">
                <label className="trener-label">E-mail</label>
                <input
                  type="email"
                  className="trener-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="info@bodyandmindon.cz"
                  required
                />
              </div>
              <div className="trener-field">
                <label className="trener-label">Heslo (min. 6 znaků)</label>
                <input
                  type="password"
                  className="trener-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Zvol si heslo"
                  minLength={6}
                  required
                />
              </div>
              <div className="trener-field">
                <label className="trener-label">Heslo znovu</label>
                <input
                  type="password"
                  className="trener-input"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Zadej heslo znovu"
                  minLength={6}
                  required
                />
              </div>
              {message && <p className="trener-message">{message}</p>}
              <button type="submit" className="trener-btn trener-btn-primary" disabled={loading}>
                {loading ? "Vytvářím účet…" : "Registrovat se jako trenér"}
              </button>
            </form>
          )}

          <p className="trener-back">
            <Link href="/start">← Zpět na výběr programů</Link>
          </p>
        </div>
      </main>

      <style jsx>{`
        .trener-hero { text-align: center; margin-bottom: 40px; }
        .trener-title { font-size: 1.75rem; font-weight: 700; color: #38bdf8; margin: 0 0 12px; }
        .trener-lead { font-size: 1rem; color: #94a3b8; max-width: 42rem; margin: 0 auto; line-height: 1.5; }
        .trener-form-wrap { max-width: 32rem; margin: 0 auto; }
        .trener-success-card, .trener-form {
          background: #121212; padding: 32px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
          border: 1px solid #222;
        }
        .trener-success-card { text-align: center; }
        .trener-success-text { font-size: 1.125rem; color: #86efac; margin: 0 0 24px; }
        .trener-form { display: flex; flex-direction: column; gap: 24px; }
        .trener-field { display: flex; flex-direction: column; gap: 6px; }
        .trener-label { font-size: 14px; color: #94a3b8; }
        .trener-input {
          width: 100%; padding: 12px 14px; border-radius: 10px; background: #0f0f0f;
          border: 1px solid #374151; color: #fff; font-size: 15px;
        }
        .trener-input:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2); }
        .trener-message { font-size: 14px; color: #f87171; margin: 0; }
        .trener-btn {
          padding: 14px 24px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer;
          text-align: center; text-decoration: none; display: inline-block; border: none;
        }
        .trener-btn-primary {
          background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff;
          transition: opacity 0.2s;
        }
        .trener-btn-primary:hover:not(:disabled) { opacity: 0.9; }
        .trener-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .trener-back { margin-top: 24px; text-align: center; font-size: 14px; }
        .trener-back a { color: #94a3b8; text-decoration: none; }
        .trener-back a:hover { color: #c4b5fd; }
      `}</style>
      <Footer />
    </>
  );
}
