import Link from 'next/link'

export default function Home(){
  return (
    <div>
      <section className="hero">
        <div>
          <h1>Body & Mind ON</h1>
          <p>Kompletní systém pro <strong>silné tělo</strong>, více energie a pevné sebevědomí.
            Nejde jen o trénink nebo jídelníček – <strong>AI asistent</strong> ti spojí jídlo, pohyb a mindset
            do <strong>jednoduchých kroků</strong>.</p>
          <div className="cta">
            <Link href="/pricing" className="btn">Zobraz ceník</Link>
            <a href="https://bodyandmindon.cz" className="ghost">Zpět na web</a>
          </div>
        </div>
        <div className="card">
          <h2>Co získáš</h2>
          <ul style={{ margin: '8px 0 0 16px', color: 'var(--muted)' }}>
            <li>Osobní kalorický cíl a makra</li>
            <li>Týdenní plán jídla i tréninku</li>
            <li>Jednoduché úkoly pro návyk</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
