import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabaseClient';
import {
  setBetaJoinPending,
  hasBetaJoinPending,
  joinBetaCohort,
} from '../lib/betaJoinClient';
import { BETA_TERMS_VERSION } from '../lib/betaCohortConstants';

export default function BetaEntryPage() {
  const router = useRouter();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(() => setSessionChecked(true));
  }, []);

  useEffect(() => {
    if (!sessionChecked) return;
    let cancelled = false;

    (async () => {
      const pending = hasBetaJoinPending();
      if (!pending) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;

      setLoading(true);
      const result = await joinBetaCohort(session.access_token, BETA_TERMS_VERSION);
      if (cancelled) return;

      if (result.ok) {
        router.replace('/start');
        return;
      }

      if (result.status === 409) {
        setStatus('Beta testování je momentálně naplněné. Děkujeme za zájem.');
      } else if (result.status === 403) {
        setStatus('Beta testování momentálně nepřijímá nové účastníky.');
      } else {
        setStatus(result.error || 'Nepodařilo se přidat do beta testování.');
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [sessionChecked, router]);

  async function handleStart(e) {
    e.preventDefault();
    if (!termsAccepted) {
      setStatus('Pro pokračování je nutný souhlas s beta podmínkami.');
      return;
    }

    setLoading(true);
    setStatus('');

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const result = await joinBetaCohort(session.access_token, BETA_TERMS_VERSION);
      if (result.ok) {
        router.replace('/start');
        return;
      }
      if (result.status === 409) {
        setStatus('Beta testování je momentálně naplněné. Děkujeme za zájem.');
      } else if (result.status === 403) {
        setStatus('Beta testování momentálně nepřijímá nové účastníky.');
      } else {
        setStatus(result.error || 'Nepodařilo se přidat do beta testování.');
      }
      setLoading(false);
      return;
    }

    setBetaJoinPending();
    router.replace('/start');
  }

  return (
    <>
      <Header />
      <main className="app-page container py-12 text-white">
        <div className="app-page-bg-decor" aria-hidden>
          <span className="app-page-bg-orb app-page-bg-orb--center" />
        </div>
        <section className="max-w-xl mx-auto">
          <h1 className="text-3xl font-extrabold mb-3 text-sky-400 text-center">
            Vyzkoušej Body & Mind ON zdarma
          </h1>
          <p className="text-gray-300 text-center mb-8 leading-relaxed">
            Získej osobní 7denní jídelníček a tréninkový plán. Aplikace je v uzavřené beta verzi
            a potřebujeme tvoji upřímnou zpětnou vazbu.
          </p>

          <ul className="list-disc pl-5 space-y-2 text-gray-200 text-sm mb-6">
            <li>osobní plán na 7 dní</li>
            <li>jídelníček a trénink</li>
            <li>denní přehled</li>
            <li>beta verze zdarma</li>
          </ul>

          <form onSubmit={handleStart} className="space-y-4">
            <label className="flex items-start gap-3 text-sm text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                required
              />
              <span>
                Souhlasím s účastí v beta testování a rozumím tomu, že aplikace je ve vývoji.
              </span>
            </label>

            <p className="text-xs text-gray-400 leading-relaxed">
              Body & Mind ON poskytuje obecná fitness a výživová doporučení. Nenahrazuje lékaře,
              fyzioterapeuta ani jiného zdravotního odborníka.
            </p>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-900 font-bold disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Připravuji…' : 'Začít zdarma'}
            </button>

            {status && (
              <p className="text-red-300 text-sm" role="alert">{status}</p>
            )}
          </form>

          <p className="text-center text-gray-400 text-sm mt-6">
            Už máš účet?{' '}
            <Link
              href="/login?redirect=/beta"
              className="text-sky-400 hover:underline"
              onClick={() => { if (termsAccepted) setBetaJoinPending(); }}
            >
              Přihlásit se
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
