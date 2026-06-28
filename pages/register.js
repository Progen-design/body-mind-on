// /pages/register.js - Přesměrování na /start pro sjednocení onboarding flow
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Register() {
  const router = useRouter()
  const { plan } = router.query

  useEffect(() => {
    if (!router.isReady) return
    if (plan === 'club') {
      router.replace('/on-club')
      return
    }
    if (plan === 'vip') {
      router.replace('/chci-vip')
      return
    }
    if (plan) {
      router.replace(`/start?plan=${plan}`)
    } else {
      router.replace('/start')
    }
  }, [router, plan])

  return null
}
