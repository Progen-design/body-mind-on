// /pages/_document.js
import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  render() {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz';
    // Pozn: canonical je statický, v Next 14 bez routeru; pro detailní per-page canonical můžeš doplnit přímo v jednotlivých stránkách.
    return (
      <Html lang="cs">
        <Head>
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
