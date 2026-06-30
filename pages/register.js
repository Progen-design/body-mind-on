// /pages/register.js - Přesměrování na /start pro sjednocení onboarding flow
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Register() {
  const router = useRouter()
  const { plan } = router.query

  useEffect(() => {
    if (!router.isReady) return
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) {
        router.replace('/profil')
        return
      }
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
        router.replace('/login?redirect=/profil')
      }
    })()
    return () => { cancelled = true }
  }, [router, plan])

  return null
}
