import { useEffect, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function Index() {
  const [showIntro, setShowIntro] = useState(true)

  useEffect(() => {
    const alreadyVisited = localStorage.getItem('visited')

    // pokud už uživatel byl, intro přeskočí
    if (alreadyVisited) {
      setShowIntro(false)
      return
    }

    // jinak spustíme video a uložíme, že už byl
    const timer = setTimeout(() => {
      setShowIntro(false)
      localStorage.setItem('visited', 'true')
    }, 25000) // intro 25 sekund

    return () => clearTimeout(timer)
  }, [])

  if (showIntro) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: '#000',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          zIndex: 9999,
        }}
      >
        <iframe
          src="https://app.heygen.com/embedded-player/655e8d7c84404b748d39a97149c0d9d4?autoplay=1&muted=1"
          title="Body & Mind ON Intro"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '0',
          }}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        ></iframe>

        <button
          onClick={() => {
            localStorage.setItem('visited', 'true')
            setShowIntro(false)
          }}
          style={{
            position: 'absolute',
            bottom: '30px',
            padding: '12px 26px',
            background: '#7C3AED',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            boxShadow: '0 0 12px rgba(124,58,237,0.6)',
          }}
        >
          Přeskočit intro ↓
        </button>
      </div>
    )
  }

  // 🔹 Po přehrání introvidea se zobrazí hlavní obsah
  return (
    <>
      <Header />
      <main className="container">
        <h1>Body & Mind ON</h1>
        <p>Zapni své tělo i mysl – objev systém, který propojuje pohyb, výživu a psychickou pohodu.</p>
        {/* 🔹 Zde zůstává tvá původní logika registrace nebo obsah landing page */}
      </main>
      <Footer />
    </>
  )
}
