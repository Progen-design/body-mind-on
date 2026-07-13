import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabaseClient';
import {
  storePendingBetaInvite,
  claimPendingBetaInvite,
  clearPendingBetaInvite,
} from '../lib/betaInviteClient';
import { BETA_TERMS_VERSION } from '../lib/betaCohortConstants';

export default function BetaEntryPage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [validated, setValidated] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session?.access_token);
      setSessionChecked(true);
    });
  }, []);

  const validateCode = useCallback(async (code) => {
    const trimmed = String(code || '').trim().toUpperCase();
    if (!trimmed) {
      setValidated(null);
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch('/api/beta/validate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.valid) {
        setValidated({
          cohort_code: json.cohort_code,
          cohort_name: json.cohort_name,
          remaining_slots: json.remaining_slots,
        });
      } else {
        setValidated(null);
        setStatus('Invite kód není platný nebo už byl použit.');
      }
    } catch {
      setStatus('Nepodařilo se ověřit invite kód. Zkus to znovu.');
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleContinue(e) {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (!code || !validated) {
      setStatus('Zadej platný invite kód.');
      return;
    }
    if (!termsAccepted) {
      setStatus('Pro pokračování je nutný souhlas s beta podmínkami.');
      return;
    }

    setLoading(true);
    setStatus('');

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch('/api/beta/claim-invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invite_code: code,
          beta_terms_accepted: true,
          beta_terms_version: BETA_TERMS_VERSION,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        clearPendingBetaInvite();
        router.replace('/start');
        return;
      }
      setStatus(json.error || 'Invite se nepodařilo uplatnit.');
      setLoading(false);
      return;
    }

    storePendingBetaInvite(code);
    router.replace('/start');
  }

  useEffect(() => {
    if (!sessionChecked || !hasSession) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      const pending = typeof window !== 'undefined' ? sessionStorage.getItem('beta_pending_invite') : null;
      if (!pending) return;
      const result = await claimPendingBetaInvite(session.access_token, BETA_TERMS_VERSION);
      if (result.ok) router.replace('/start');
    });
  }, [sessionChecked, hasSession, router]);

  return (
    <>
      <Header />
      <main className="app-page container py-12 text-white">
        <div className="app-page-bg-decor" aria-hidden>
          <span className="app-page-bg-orb app-page-bg-orb--center" />
        </div>
        <section className="max-w-xl mx-auto">
          <h1 className="text-3xl font-extrabold mb-3 text-sky-400 text-center">
            Uzavřená beta START
          </h1>
          <p className="text-gray-300 text-center mb-8">
            Máš osobní pozvánku? Zadej invite kód a pokračuj do registrace.
          </p>

          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 mb-6 text-sm text-gray-200 leading-relaxed">
            <p className="font-semibold text-amber-200 mb-2">Jsi součástí uzavřené beta verze START.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Funkce se mohou měnit během testování.</li>
              <li>Plán je obecné fitness a výživové doporučení, ne zdravotní péče.</li>
              <li>Při zdravotních omezeních konzultuj odborníka.</li>
              <li>Tvoje zpětná vazba pomůže produkt zlepšit.</li>
              <li>Citlivé zdravotní údaje nepiš do volného textu ve feedbacku.</li>
            </ul>
          </div>

          <form onSubmit={handleContinue} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="beta-invite">
                Invite kód
              </label>
              <input
                id="beta-invite"
                type="text"
                className="w-full px-4 py-3 rounded-lg bg-slate-900/60 border border-slate-600 text-white uppercase tracking-widest"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                onBlur={() => validateCode(inviteCode)}
                placeholder="Např. ABCD1234EFGH5678"
                autoComplete="off"
                required
              />
            </div>

            {validated && (
              <p className="text-emerald-300 text-sm">
                Pozvánka platná — {validated.cohort_name} ({validated.cohort_code}).
                Volných míst: {validated.remaining_slots}.
              </p>
            )}

            <label className="flex items-start gap-3 text-sm text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                required
              />
              <span>
                Souhlasím s účastí v uzavřené beta verzi a rozumím tomu, že produkt je ve vývoji.
              </span>
            </label>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-900 font-bold disabled:opacity-50"
              disabled={loading || !validated}
            >
              {loading ? 'Ověřuji…' : 'Pokračovat do START'}
            </button>

            {status && (
              <p className="text-red-300 text-sm" role="alert">{status}</p>
            )}
          </form>

          <p className="text-center text-gray-400 text-sm mt-6">
            Už máš účet?{' '}
            <Link href="/login?redirect=/start" className="text-sky-400 hover:underline">
              Přihlásit se
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
