// /pages/register.js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'

export default function Register() {
  const router = useRouter()
  const { plan } = router.query

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!plan) router.replace('/pricing')
  }, [plan, router])

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true); setMsg(null)
    try {
      const { error } = await supabase
        .from('body_metrics')
        .insert([{
          name,
          email,
          plan,
          lead_source: 'app_pricing'
        }])

      if (error) throw error

      setMsg({ type: 'ok', text: 'Díky! Zkontroluj e-mail pro další kroky.' })
      setName(''); setEmail('')
      // případně: router.push('/thankyou')
    } catch (err) {
      setMsg({ type: 'err', text: 'Chyba – zkus to znovu.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="container">
        <h1>Registrace pro plán <strong>{plan || ''}</strong></h1>
        <form className="form" onSubmit={onSubmit}>
          <div className="row">
            <div>
              <label className="label">Jméno a příjmení</label>
              <input className="input" value={name} onChange={(e)=>setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
            </div>
          </div>
          <button className="submit" disabled={loading}>
            {loading ? 'Odesílám…' : 'Registrovat'}
          </button>
          {msg && (
            <p className="note" style={{ color: msg.type === 'ok' ? 'var(--success)' : 'var(--error)' }}>
              {msg.text}
            </p>
          )}
        </form>
      </main>
      <Footer />
    </>
  )
}
