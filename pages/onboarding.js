// /pages/onboarding.js - Přesměrování na START formulář s API
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function Onboarding() {
  const router = useRouter()
  const { plan } = router.query

  useEffect(() => {
    const target = plan ? { pathname: '/start', query: { plan } } : '/start'
    router.replace(target)
  }, [router, plan])

  return null
}
