// /pages/register.js - Přesměrování na /start pro sjednocení onboarding flow
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Register() {
  const router = useRouter()
  const { plan } = router.query

  useEffect(() => {
    // Přesměrovat na /start s parametrem plan, pokud existuje
    if (plan) {
      router.replace(`/start?plan=${plan}`)
    } else {
      router.replace('/start')
    }
  }, [router, plan])

  return null
}
