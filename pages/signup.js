// /pages/signup.js
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password: pwd
      });
      if (error) throw error;
      setMsg('✅ Zkontroluj e-mail a potvrď registraci.');
    } catch (err) {
      setMsg(`❌ ${err.message || 'Chyba registrace'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="container" style={{maxWidth: 520, margin: '32px auto', padding: '0 16px'}}>
        <h1>Vytvořit účet</h1>
        <form onSubmit={onSubmit} className="grid" style={{gap: 12}}>
          <div>
            <label>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div>
            <label>Heslo</label>
            <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} required />
          </div>
          <button className="btn" disabled={loading}>{loading ? 'Odesílám…' : 'Registrovat'}</button>
          {msg && <p style={{marginTop:8}}>{msg}</p>}
        </form>
      </main>
      <Footer />
    </>
  );
}
