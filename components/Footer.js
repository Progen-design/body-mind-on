// /components/Footer.js
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container foot">
        <p>© {new Date().getFullYear()} Body & Mind ON</p>
        <div className="links">
          <Link href="/obchodni-podminky">Obchodní podmínky</Link>
          <Link href="/gdpr">GDPR</Link>
          <a href="mailto:info@bodyandmindon.cz">Kontakt</a>
        </div>
      </div>
    </footer>
  )
}
