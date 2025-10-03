import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
// import supabase klient např. from '../lib/supabaseClient'

export default function Register() {
  const router = useRouter()
  const { plan } = router.query
  const [formData, setFormData] = useState({ name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (!plan) {
      router.push('/pricing')
    }
  }, [plan])

  function handleChange(e) {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { name, email } = formData
    if (!name || !email) {
      setMessage({ type: 'err', text: 'Vyplň jméno a e-mail.' })
      setLoading(false)
      return
    }

    const payload = { name, email, plan }
    try {
      // nahraď svým kódem pro supabase insert
      // const { data, error } = await supabase
      //   .from('body_metrics')
      //   .insert([payload])
      // if (error) throw error
      await new Promise(r => setTimeout(r, 600))
      setMessage({ type: 'ok', text: 'Díky! Zkontroluj e-mail.' })
      // případně přesměrování na další krok nebo stránku
      // router.push('/thankyou')
    } catch (err) {
      setMessage({ type: 'err', text: 'Chyba, zkuste znovu.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="container">
        <h1>Registrovat pro plán <strong>{plan}</strong></h1>
        <form className="form" onSubmit={handleSubmit}>
          <div className="row">
            <div>
              <label className="label">Jméno a příjmení</label>
              <input className="input" name="name" type="text" value={formData.name} onChange={handleChange} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" name="email" type="email" value={formData.email} onChange={handleChange} required />
            </div>
          </div>
          <button className="submit" type="submit" disabled={loading}>
            {loading ? 'Odesílám…' : 'Registrovat'}
          </button>
        </form>
        {message && (
          <p className="note" style={{ color: message.type === 'ok' ? 'var(--success)' : 'var(--error)' }}>
            {message.text}
          </p>
        )}
      </main>
      <Footer />
    </>
  )
}
