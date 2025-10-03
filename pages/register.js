// /pages/register.js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

const WEBHOOK_URL = process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL

export default function Register() {
  const router = useRouter()
  const { plan } = router.query

  const [name, setName]   = useState('')
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
      if (!WEBHOOK_URL) {
        throw new Error('Chybí env NEXT_PUBLIC_MAKE_WEBHOOK_URL')
      }

      const payload = {
        name,
        email,
        plan,
        lead_source: 'app_pricing',
        ts: new Date().toISOString(),
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : ''
      }

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Webhook HTTP ${res.status} ${text}`)
      }

      setMsg({ type: 'ok', text: 'Díky! Máš to odeslané – mrkni do e-mailu.' })
      setName(''); setEmail('')
      // případně: router.push('/thankyou')
    } catch (err) {
      console.error('MAKE WEBHOOK ERROR:', err)
      setMsg({ type: 'err', text: 'Chyba při odesílání – zkus to znovu.' })
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
