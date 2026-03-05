// /pages/pricing.js – přesměrování na START (ceník je na /start)
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PricingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/start');
  }, [router]);

  return null;
}
