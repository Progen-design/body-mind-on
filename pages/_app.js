// /pages/_app.js
import '../styles/globals.css'
import '../styles/trial-paywall.css'
import WithingsProfileCard from '../components/profile/WithingsProfileCard'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <WithingsProfileCard />
    </>
  )
}
