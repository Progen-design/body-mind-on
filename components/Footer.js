export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container foot">
        <p>© {new Date().getFullYear()} Body & Mind ON</p>
        <div className="links">
          <a href="https://bodyandmindon.cz/obchodni-podminky">Obchodní podmínky</a>
          <a href="https://bodyandmindon.cz/gdpr">GDPR</a>
          <a href="mailto:info@bodyandmindon.cz">Kontakt</a>
        </div>
      </div>
    </footer>
  )
}
