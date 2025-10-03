import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="cs">
      <Head>
        {/* Odstraněno <link rel="icon" ...> aby se nevolalo favicon.ico */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
