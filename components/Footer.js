// /components/Footer.js
import { getPublicMainSiteUrl } from '../lib/siteUrls.js';

export default function Footer() {
  const main = getPublicMainSiteUrl();
  return (
    <footer className="site-footer">
      <div className="container foot">
        <p>© {new Date().getFullYear()} Body & Mind ON</p>
        <div className="links">
          <a href={`${main}/obchodni-podminky`}>Obchodní podmínky</a>
          <a href={`${main}/gdpr`}>GDPR</a>
          <a href="mailto:info@bodyandmindon.cz">Kontakt</a>
        </div>
      </div>
    </footer>
  )
}
