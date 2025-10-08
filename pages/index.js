import { useEffect, useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function Index() {
  const [showIntro, setShowIntro] = useState(true)

  useEffect(() => {
    const alreadyVisited = localStorage.getItem('visited')
    if (alreadyVisited) {
      setShowIntro(false)
    } else {
      const timer = setTimeout(() => {
        setShowIntro(false)
        localStorage.setItem('visited', 'true')
      }, 25000) // přehrát intro 25 sekund
      return () => clearTimeout(timer)
    }
  }, [])

  if (showIntro) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column'
      }}>
        <iframe
          src="https://app.heygen.com/embedded-player/655e8d7c84404b748d39a97149c0d9d4?autoplay=1&muted=1"
          style={{ width: '100%', height: '100%', border: 'none' }}
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
            bottom: '20px',
            padding: '10px 20px',
            background: '#6A0DAD',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Přeskočit intro
        </button>
      </div>
    )
  }

  // Tady zůstává tvoje původní registrační logika
  return (
    <>
      <Header />
      <main className="container">
        <h1>Body & Mind ON</h1>
        {/* ... sem vložíme celý původní obsah registrační logiky */}
      </main>
      <Footer />
    </>
  )
}
