// pages/_app.js
import '../styles/globals.css'
import Head from 'next/head'
import Header from '../components/Header'
import Footer from '../components/Footer'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Body & Mind ON – Aplikace</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Osobní plány, progress a challenge." />
        <meta property="og:title" content="Body & Mind ON" />
        <meta property="og:url" content="https://app.bodyandmindon.cz" />
        <meta property="og:description" content="Tvůj fitness hub." />
      </Head>
      <Header />
      <main className="container">
        <Component {...pageProps} />
      </main>
      <Footer />
    </>
  )
}

export default MyApp
