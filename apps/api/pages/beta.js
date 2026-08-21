import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Beta registration is retired — keep /beta as a soft redirect for old links.
 * New users register via /start (START trial is granted by DB trigger).
 */
export default function BetaRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace('/start');
  }, [router.isReady, router]);

  return null;
}
