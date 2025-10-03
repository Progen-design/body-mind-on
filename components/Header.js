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
          <Link href="/plans">Plány</Link>
          <Link href="/challenge">Challenge</Link>
          <Link href="/" className="ghost">Zpět na web</Link>
          <Link href="/auth" className="btn">Přihlásit</Link>
        </nav>
      </div>
    </header>
  )
}
