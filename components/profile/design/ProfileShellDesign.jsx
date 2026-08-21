/**
 * SHELL PROFILU podle návrhu v4 — horní lišta, karta uživatele, záložky
 * a rychlé akce.
 *
 * Komponenty jsou čistě prezentační: všechna data i obsluha kliknutí chodí
 * z `pages/profil.js`. Nic si tady nedopočítává ani nedomýšlí — když hodnota
 * chybí, prvek se nevykreslí, místo aby ukázal nulu nebo zástupné číslo.
 *
 * CO SE Z NÁVRHU ZÁMĚRNĚ NEPŘENESLO:
 *   - tlačítko „AI Trenér“ v hlavičce a položka „AI Trenér TED (Konzultace)“
 *     v menu — TED v produktu neexistuje, v ceníku je „BRZY“;
 *   - „Withings Body Scan • Baterie 92 %“ a „Wi-Fi signál: Silný (5 GHz)“ —
 *     stav baterie ani sílu signálu z Withings API nečteme;
 *   - odznak „PRO“ a patička „Platform v3.4“ — vymyšlené označení verze.
 * Stav připojení zařízení v menu se proto bere z `/api/health/connection`
 * a `/api/withings/status`, ne z popisků v návrhu.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Dumbbell, Menu, RefreshCw, Scale, ShieldCheck, Sliders, X } from 'lucide-react';
import {
  NEON_TLACITKO,
  SKLO,
  STAV_AKTIVNI,
  STAV_CEKA,
  STAV_NEAKTIVNI,
  STAV_ODZNAK,
  TLACITKO,
  ZALOZKA,
  ZALOZKA_AKTIVNI,
  ZALOZKY_LISTA,
  LISTA_OBSAH,
  LISTA_SKLO,
  SIRKA_OBSAHU,
} from '../../../lib/profile/designTokens.js';

/** Barva odznaku podle stavu členství. Význam, ne vkus. */
export function tridaStavu(stav) {
  if (stav === 'aktivni') return STAV_AKTIVNI;
  if (stav === 'ceka') return STAV_CEKA;
  return STAV_NEAKTIVNI;
}

/**
 * Horní lišta — značka vlevo, menu vpravo.
 *
 * @param {{
 *   isMenuOpen: boolean,
 *   onOpenMenu: () => void,
 *   onCloseMenu: () => void,
 *   polozkyMenu?: Array<{id: string, popisek: string}>,
 *   onVybratPolozku?: (id: string) => void,
 *   zarizeni?: Array<{nazev: string, stav: string, pripojeno: boolean}>,
 * }} props
 */
export function ProfileTopBar({
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  polozkyMenu = [],
  onVybratPolozku,
  zarizeni = [],
}) {
  return (
    /* LIŠTA JE PŘES CELOU ŠÍŘKU, JEJÍ OBSAH NE.
       Pozadí a spodní linka jdou od kraje ke kraji, ale logo a menu sedí
       v `LISTA_OBSAH` — tedy na stejné mřížce (max 1180 px) jako karty pod
       lištou. Do 21. 8. 2026 byly obojí zarovnané k okraji okna a lišta
       o 102 px na každou stranu nesedla s ničím pod sebou.

       `profile-topbar` není jen kosmetika: pravidlo `.page > *:not(...)`
       v profil.js nastavuje všem dětem `position: relative` a přebilo by
       `sticky`. Třída je z toho pravidla vyjmutá. */
    <header className={`profile-topbar sticky top-0 z-30 mb-1 -mx-[var(--page-pad)] px-[var(--page-pad)] py-2 sm:py-3 ${LISTA_SKLO}`}>
      <div className={LISTA_OBSAH}>
      {/* Značka je zpátky: globální `Header.js` se na profilu už nevykresluje,
          takže tahle lišta je jediná. Krátce tu místo ní stál štítek „Profil“,
          který se na úzkých displejích ořezával na „ROFIL“. */}
      <div className="flex min-w-0 select-none items-center gap-2">
        <h1 className="m-0 flex items-center gap-1.5 truncate text-lg font-bold tracking-tight text-white sm:text-2xl">
          <span>Body &amp; Mind</span>
          <span className="font-extrabold text-[#39ff14] drop-shadow-[0_0_12px_rgba(57,255,20,0.6)]">ON</span>
        </h1>
      </div>

      <button
        type="button"
        onClick={isMenuOpen ? onCloseMenu : onOpenMenu}
        className={`${TLACITKO} h-10 w-10 rounded-xl px-0`}
        aria-label={isMenuOpen ? 'Zavřít menu' : 'Otevřít menu'}
        aria-expanded={isMenuOpen}
      >
        {isMenuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      </div>

      <AnimatePresence>
        {isMenuOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMenu}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
              aria-hidden
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              role="dialog"
              aria-label="Menu profilu"
              className="fixed right-0 top-0 z-50 flex h-full w-80 max-w-[85vw] flex-col justify-between border-l border-[#00f2fe]/20 bg-[#0c1017] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
            >
              <div>
                <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                  <span className="text-lg font-bold text-white">
                    Body &amp; Mind <span className="font-black text-[#39ff14]">ON</span>
                  </span>
                  <button
                    type="button"
                    onClick={onCloseMenu}
                    className={`${TLACITKO} h-8 w-8 rounded-lg px-0`}
                    aria-label="Zavřít menu"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <div className="mt-6 space-y-1.5">
                  <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    Navigace
                  </div>
                  {polozkyMenu.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onCloseMenu?.();
                        onVybratPolozku?.(p.id);
                      }}
                      className="w-full rounded-xl border border-transparent bg-transparent px-3 py-2 text-left text-xs font-semibold text-neutral-300 transition-all hover:border-neutral-800 hover:bg-neutral-900/80 hover:text-white"
                    >
                      {p.popisek}
                    </button>
                  ))}
                </div>

                {zarizeni.length > 0 ? (
                  <div className="mt-8 space-y-2">
                    <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                      Zařízení
                    </div>
                    {zarizeni.map((z) => (
                      <div
                        key={z.nazev}
                        className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 p-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-neutral-200">{z.nazev}</div>
                          <div className={`text-[11px] ${z.pripojeno ? 'text-[#39ff14]' : 'text-neutral-500'}`}>
                            {z.stav}
                          </div>
                        </div>
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${z.pripojeno ? 'bg-[#39ff14]' : 'bg-neutral-600'}`}
                          aria-hidden
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

/**
 * Karta uživatele — avatar, jméno, stav členství.
 *
 * Avatar se nahrává stávajícím mechanismem (Supabase storage `avatars`
 * → `profiles.avatar_url` přes `/api/profile-settings`); komponenta jen
 * vykresluje a volá obsluhu, kterou dostane. Druhý mechanismus by znamenal
 * dvě místa, kde se fotka ukládá jinak.
 */
export function ProfileUserCard({
  jmeno,
  popisPlanu,
  stavPopisek,
  stavTrida,
  avatarUrl,
  avatarRozbity,
  onAvatarChyba,
  onZmenitFoto,
  nahravam = false,
  chyba,
  inputRef,
  onSouborZmenen,
}) {
  const iniciala = String(jmeno || '').trim().charAt(0).toUpperCase() || '?';

  return (
    /* SIRKA_OBSAHU, ne plná šířka. Karta stojí přímo v `.page`, takže bez
       omezení roste na celou stránku — naměřeno 1400 px proti 1180 px
       u sekcí pod ní a byla to nejnápadnější nezarovnaná věc na profilu. */
    <div className={`${SKLO} ${SIRKA_OBSAHU} relative mb-2.5 overflow-hidden p-3.5 sm:p-4`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#00f2fe]/10 blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-[#39ff14]/10 blur-2xl" aria-hidden />

      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={onZmenitFoto}
              disabled={nahravam}
              className="block h-14 w-14 rounded-full border-0 bg-gradient-to-tr from-[#00f2fe] to-[#39ff14] p-0.5 shadow-[0_0_15px_rgba(0,242,254,0.3)] transition-transform hover:scale-[1.03] disabled:opacity-60 sm:h-16 sm:w-16"
              aria-label="Změnit profilový obrázek"
            >
              {avatarUrl && !avatarRozbity ? (
                <img
                  src={avatarUrl}
                  alt=""
                  onError={onAvatarChyba}
                  className="h-full w-full rounded-full bg-neutral-900 object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-neutral-900 text-xl font-bold text-neutral-300">
                  {iniciala}
                </span>
              )}
            </button>
            <span
              className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-[#0e131d] bg-[#39ff14] shadow-[0_0_8px_#39ff14]"
              aria-hidden
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="m-0 truncate text-xl font-bold tracking-tight text-white sm:text-2xl">{jmeno}</h2>
              <ShieldCheck className="hidden h-4 w-4 shrink-0 text-[#00f2fe] sm:inline" aria-hidden />
            </div>
            {popisPlanu ? (
              <p className="m-0 mt-0.5 truncate text-xs font-medium text-neutral-400">{popisPlanu}</p>
            ) : null}
            <button
              type="button"
              onClick={onZmenitFoto}
              disabled={nahravam}
              className="-ml-1 mt-0.5 min-h-[28px] rounded-md border-0 bg-transparent px-1 py-1 text-[11px] font-semibold text-neutral-400 underline-offset-2 transition-colors hover:text-[#00f2fe] hover:underline disabled:opacity-60"
            >
              {nahravam ? 'Nahrávám…' : 'Změnit foto'}
            </button>
          </div>
        </div>

        {stavPopisek ? (
          <div className={`${STAV_ODZNAK} ${stavTrida} shrink-0`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            <span>{stavPopisek}</span>
          </div>
        ) : null}
      </div>

      <input
        type="file"
        ref={inputRef}
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={onSouborZmenen}
      />
      {chyba ? (
        <p className="relative z-10 m-0 mt-3 text-xs text-red-300" role="alert">
          {chyba}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Lišta záložek.
 *
 * Odznaky chodí zvenčí už jako hotový text, nebo null. Návrh měl u regenerace
 * napsanou sedmdesátku natvrdo — tady se odznak bez dat prostě nevykreslí.
 */
export function ProfileTabs({ zalozky = [], aktivni, onVybrat, odznaky = {} }) {
  return (
    <nav className="no-scrollbar relative z-20 overflow-x-auto" aria-label="Sekce profilu">
      <div className={ZALOZKY_LISTA}>
        {zalozky.map((z) => {
          const jeAktivni = z.id === aktivni;
          const odznak = odznaky[z.id];
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => onVybrat?.(z)}
              className={jeAktivni ? ZALOZKA_AKTIVNI : ZALOZKA}
              aria-current={jeAktivni ? 'true' : undefined}
            >
              <span aria-hidden>{z.ikona}</span>
              <span>{z.popisek}</span>
              {odznak ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    jeAktivni
                      ? 'border border-[#39ff14]/40 bg-[#39ff14]/20 text-[#39ff14]'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {odznak}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Rychlé akce — čtyři věci, které uživatel dělá nejčastěji. */
export function ProfileQuickActions({
  onZapsatTrenink,
  onUpravitPreference,
  onSynchronizovat,
  onZapsatVahu,
  synchronizuji = false,
  lzeSynchronizovat = true,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Rychlé akce</span>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onZapsatTrenink} className={`${TLACITKO} min-h-[38px] px-3.5`}>
          <Dumbbell className="h-3.5 w-3.5 text-[#39ff14]" aria-hidden />
          <span>Zapsat trénink</span>
        </button>

        <button type="button" onClick={onZapsatVahu} className={`${TLACITKO} min-h-[38px] px-3.5`}>
          <Scale className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
          <span>Nové vážení</span>
        </button>

        <button type="button" onClick={onUpravitPreference} className={`${TLACITKO} min-h-[38px] px-3.5`}>
          <Sliders className="h-3.5 w-3.5 text-[#00f2fe]" aria-hidden />
          <span>Upravit preference</span>
        </button>

        {lzeSynchronizovat ? (
          <button
            type="button"
            onClick={onSynchronizovat}
            disabled={synchronizuji}
            className={`${NEON_TLACITKO} min-h-[38px] px-3.5 text-xs sm:text-sm`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${synchronizuji ? 'animate-spin' : ''}`} aria-hidden />
            <span>{synchronizuji ? 'Synchronizuji…' : 'Synchronizovat teď'}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
