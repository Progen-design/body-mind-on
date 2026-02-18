// /pages/pricing.js
import { useEffect } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import BodyMetricsForm from '../components/BodyMetricsForm'

export default function PricingPage() {
  useEffect(() => { window.__BMON_FORM_V2 = true }, [])

  return (
    <>
      <Header />
      <section className="container">
        <h2>Detaily pro „Start“</h2>
        <BodyMetricsForm submitLabel="Dokončit registraci" />
      </section>
      <Footer />

      <style jsx>{`
        .container { max-width: 980px; margin: 32px auto; padding: 0 16px; }
      `}</style>
    </>
  )
}
