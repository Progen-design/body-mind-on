// /pages/_document.js
import Document, { Html, Head, Main, NextScript } from 'next/document';
import { getPublicAppUrl } from '../lib/siteUrls.js';

export default class MyDocument extends Document {
  render() {
    const APP_URL = getPublicAppUrl();
    // Pozn: canonical je statický, v Next 14 bez routeru; pro detailní per-page canonical můžeš doplnit přímo v jednotlivých stránkách.
    return (
      <Html lang="cs">
        <Head>
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="mobile-web-app-capable" content="yes" />
          <link rel="canonical" href={APP_URL} />
          <meta property="og:url" content={APP_URL} />
          <meta property="og:site_name" content="Body & Mind ON" />
          <meta name="theme-color" content="#0ea5e9" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
