// /pages/signup.js – přesměrování na /start (stejný onboarding jako /register; účet + plán přes dotazník)
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Signup() {
  const router = useRouter();
  const { plan, redirect } = router.query;

  useEffect(() => {
    const q = [];
    if (typeof plan === 'string' && plan.trim()) q.push(`plan=${encodeURIComponent(plan.trim())}`);
    if (typeof redirect === 'string' && redirect.startsWith('/')) q.push(`redirect=${encodeURIComponent(redirect)}`);
    const suffix = q.length ? `?${q.join('&')}` : '';
    router.replace(`/start${suffix}`);
  }, [router, plan, redirect]);

  return null;
}
