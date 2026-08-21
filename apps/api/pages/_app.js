// /pages/_app.js
import '../styles/globals.css'
import '../styles/trial-paywall.css'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Script from 'next/script'
import * as fbq from '../lib/fbpixel'

export default function App({ Component, pageProps }) {
  const router = useRouter()

  // Základní kód pixelu pošle PageView sám při prvním načtení.
  // Next.js ale přepíná stránky bez reloadu, takže další zobrazení hlásíme ručně.
  useEffect(() => {
    const handleRouteChange = () => fbq.pageview()
    router.events.on('routeChangeComplete', handleRouteChange)
    return () => router.events.off('routeChangeComplete', handleRouteChange)
  }, [router.events])

  return (
    <>
      <Script
        id="fb-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: fbq.FB_PIXEL_BASE_CODE }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${fbq.FB_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
      <Component {...pageProps} />
    </>
  )
}
