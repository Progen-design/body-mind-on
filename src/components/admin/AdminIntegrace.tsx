import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, AlertTriangle, Save, LogOut } from 'lucide-react';
import { AdminDotazy } from './AdminDotazy';
import { AdminNahlaseni } from './AdminNahlaseni';

/**
 * ADMIN: OAUTH ÚDAJE INTEGRACÍ.
 *
 * PROČ TAHLE STRÁNKA. Client ID a Secret aplikace registrované u Withings
 * se daly zadat jedině jako env proměnné ve Vercelu — tedy cesta do cizího
 * dashboardu a redeploy při každé změně. Tady se zadají jednou, appka si je
 * zašifruje (`lib/secretBox.js`) a uloží do `integration_credentials`.
 *
 * TOHLE NENÍ OBRAZOVKA PRO UŽIVATELE. Běžný uživatel žádné klientské údaje
 * nezadává — klikne „Připojit Withings" a jde přes OAuth. Sem se dostane
 * jedině ten, kdo zná adresu i ADMIN_TOKEN, a nevede sem žádný odkaz
 * z navigace.
 *
 * PROČ TOKEN V localStorage A NE PŘIHLÁŠENÍ. Admin endpointy stojí na
 * `isAdmin(req)` → Bearer ADMIN_TOKEN, a druhý admin login by znamenal
 * druhý mechanismus oprávnění. Token tedy zadá admin do pole a drží se
 * v prohlížeči; autoritou zůstává server, tahle stránka nic nepovoluje
 * sama od sebe — bez platného tokenu endpoint vrátí 403 a tady se ukáže
 * chyba.
 */
const KLIC_TOKENU = 'bmon_admin_token';
const ENDPOINT = '/api/admin/integrations/withings';

interface StavIntegrace {
  configured: boolean;
  source: 'db' | 'env' | null;
  client_id_masked: string | null;
  updated_at: string | null;
  updated_by: string | null;
  env_fallback_available: boolean;
}

function nactiToken(): string {
  try {
    return localStorage.getItem(KLIC_TOKENU) || '';
  } catch {
    // Privátní okno nebo zablokované úložiště — token se prostě nepamatuje.
    return '';
  }
}

export const AdminIntegrace: React.FC = () => {
  const [token, setToken] = useState<string>(() => nactiToken());
  const [tokenInput, setTokenInput] = useState('');
  const [stav, setStav] = useState<StavIntegrace | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitam, setNacitam] = useState(false);
  const [uklada, setUklada] = useState(false);
  const [hotovo, setHotovo] = useState<string | null>(null);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const nactiStav = useCallback(async (bearer: string) => {
    if (!bearer) return;
    setNacitam(true);
    setChyba(null);
    try {
      const odpoved = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${bearer}` } });
      if (odpoved.status === 401 || odpoved.status === 403) {
        throw new Error('Token neplatí. Zkontroluj ADMIN_TOKEN.');
      }
      if (!odpoved.ok) throw new Error(`Server vrátil chybu ${odpoved.status}.`);
      const telo = await odpoved.json();
      setStav({
        configured: Boolean(telo.configured),
        source: telo.source ?? null,
        client_id_masked: telo.client_id_masked ?? null,
        updated_at: telo.updated_at ?? null,
        updated_by: telo.updated_by ?? null,
        env_fallback_available: Boolean(telo.env_fallback_available)
      });
    } catch (err) {
      setStav(null);
      setChyba(err instanceof Error ? err.message : 'Stav se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, []);

  useEffect(() => {
    if (token) nactiStav(token);
  }, [token, nactiStav]);

  const prihlas = () => {
    const t = tokenInput.trim();
    if (!t) return;
    try {
      localStorage.setItem(KLIC_TOKENU, t);
    } catch {
      // Neuloží se — stránka i tak funguje do zavření karty.
    }
    setToken(t);
    setTokenInput('');
  };

  const odhlas = () => {
    try {
      localStorage.removeItem(KLIC_TOKENU);
    } catch {
      // nevadí
    }
    setToken('');
    setStav(null);
    setChyba(null);
    setHotovo(null);
  };

  const uloz = async () => {
    setUklada(true);
    setChyba(null);
    setHotovo(null);
    try {
      const odpoved = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ client_id: clientId.trim(), client_secret: clientSecret.trim() })
      });
      if (odpoved.status === 401 || odpoved.status === 403) {
        throw new Error('Token neplatí. Zkontroluj ADMIN_TOKEN.');
      }
      const telo = await odpoved.json().catch(() => ({}));
      if (!odpoved.ok) throw new Error(telo?.error || `Server vrátil chybu ${odpoved.status}.`);

      // Secret v prohlížeči nedržíme déle, než je nutné.
      setClientId('');
      setClientSecret('');
      setHotovo('Uloženo. Od teď se používají tyhle údaje.');
      await nactiStav(token);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Uložení se nepodařilo.');
    } finally {
      setUklada(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-pozadi flex items-center justify-center p-4">
        <div className="w-full max-w-sm p-6 rounded-3xl bg-povrch border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-akcent-cyan">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Admin</h1>
              <p className="text-xs text-slate-400">Vlož ADMIN_TOKEN</p>
            </div>
          </div>

          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') prihlas();
            }}
            placeholder="ADMIN_TOKEN"
            autoComplete="off"
            spellCheck={false}
            aria-label="ADMIN_TOKEN"
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/60"
          />

          <button
            type="button"
            onClick={prihlas}
            disabled={tokenInput.trim().length === 0}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 transition-all"
          >
            Pokračovat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pozadi p-4 sm:p-8">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Admin</h1>
            <p className="text-xs text-slate-400">Moderace komunity a OAuth údaje aplikace.</p>
          </div>
          <button
            type="button"
            onClick={odhlas}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Zapomenout token</span>
          </button>
        </div>

        {/* Moderace komunity. Stejná stránka, protože obojí stojí na ADMIN_TOKEN
            a druhá adresa by znamenala token zadávat dvakrát. */}
        <AdminDotazy token={token} />

        <AdminNahlaseni token={token} />

        <div className="p-5 rounded-3xl bg-povrch border border-slate-800 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-akcent-cyan">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Withings</div>
                <div className="text-[11px] text-slate-400">Client ID a Client Secret z Withings Developer Dashboardu</div>
              </div>
            </div>

            {nacitam ? (
              <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
            ) : stav?.configured ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold text-akcent-lime bg-emerald-950/60 border border-emerald-500/30">
                nastaveno
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40">
                nenastaveno
              </span>
            )}
          </div>

          {stav && (
            <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-400">
                Client ID:{' '}
                <span className="font-mono text-slate-200">{stav.client_id_masked ?? '—'}</span>
              </div>
              {/* Odkud se údaje berou TEĎ. Bez toho by admin nepoznal, že
                  uložení do DB nepřebilo starou env proměnnou. */}
              <div className="text-[11px] text-slate-400">
                Zdroj:{' '}
                <span className="text-slate-200">
                  {stav.source === 'db'
                    ? 'databáze (zadáno tady)'
                    : stav.source === 'env'
                      ? 'env proměnné ve Vercelu'
                      : 'nikde'}
                </span>
              </div>
              {stav.updated_at && (
                <div className="text-[11px] text-slate-500">
                  Naposled uloženo {new Date(stav.updated_at).toLocaleString('cs-CZ')}
                  {stav.updated_by ? ` (${stav.updated_by})` : ''}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="client-id">
              Client ID
            </label>
            <input
              id="client-id"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 outline-none focus:border-cyan-500/60"
            />

            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 pt-1" htmlFor="client-secret">
              Client Secret
            </label>
            <input
              id="client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 outline-none focus:border-cyan-500/60"
            />
            {/* Uložený secret se zpátky nevrací ani maskovaný — proto tu po
                uložení zůstane prázdné pole, ne hvězdičky. */}
            <p className="text-[11px] text-slate-500">
              Secret se po uložení nikdy nezobrazuje. Změna = vložit znovu oba údaje.
            </p>
          </div>

          <button
            type="button"
            onClick={uloz}
            disabled={uklada || clientId.trim().length === 0 || clientSecret.trim().length === 0}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-akcent-cyan disabled:bg-slate-800 disabled:text-slate-500 transition-all flex items-center justify-center gap-2"
          >
            {uklada ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{uklada ? 'Ukládám…' : 'Uložit'}</span>
          </button>

          {chyba && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{chyba}</span>
            </div>
          )}
          {hotovo && <div className="text-[11px] text-akcent-lime">{hotovo}</div>}
        </div>
      </div>
    </div>
  );
};
