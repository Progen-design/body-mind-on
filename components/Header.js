import Link from 'next/link'

export default function Header() {
  return (
    <header className="site-header">
      <div className="container nav">
        <Link href="/" className="brand">
          <img src="/logo.svg" alt="Body & Mind ON" />
          <span>Body & Mind ON</span>
        </Link>
        <nav className="menu">
          <Link href="/pricing">Ceník</Link>
          <Link href="/challenge">Challenge</Link>
          <a className="ghost" href="https://bodyandmindon.cz">Zpět na web</a>
          <Link href="/auth" className="btn">Přihlásit</Link>
        </nav>
      </div>
    </header>
  )
}
