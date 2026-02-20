# Analýza a návrh: Profil – interaktivní a automatizovaná data

## 1. Kompletní analýza problému

### Co uživatel vidí
- Na [app.bodyandmindon.cz/profil](https://app.bodyandmindon.cz/profil) se po přihlášení může zobrazit **„Načítám tvůj profil…“** a data se neaktualizují.
- Po přidání tréninku nebo váhy se **nic na stránce nemění** (graf, postava, počty).
- Požadavek: **interaktivní, automatizované a uživatelsky přívětivé** chování.

### Identifikované možné příčiny

| Oblast | Problém | Důsledek |
|--------|--------|----------|
| **Počáteční načtení** | Session/API může selhat nebo trvat dlouho (vypršený token, síť). | `loading` zůstane `true` → stále „Načítám tvůj profil…“. |
| **Žádný timeout** | Pokud `fetch('/api/profile')` nikdy nedokončí, `setLoading(false)` se nevolá. | Uživatel čeká donekonečna. |
| **Refetch po mutaci** | Refetch běžel po 0–200 ms. API někdy vrací data dřív, než je nový záznam v DB. | Optimistická aktualizace se přepíše starými daty → „nic se nemění“. |
| **Pouze interval 30 s** | Data se obnovují jen každých 30 s. | Uživatel po akci nevidí změnu, pokud refetch přepsal stav. |
| **Žádný refetch při návratu** | Když uživatel přepne záložku a vrátí se, data se neobnoví. | Zastaralý stav po dlouhém čase. |
| **Cache** | API nebo prohlížeč může cacheovat odpověď. | Stará data i po úspěšném refetchi. |

### Současný tok dat (zjednodušeně)

1. **Mount** → `getSession()` → `refreshSession()` → `fetchProfileWithToken()` → `setProfile()` → `setLoading(false)`.
2. **Přidání tréninku/váhy** → POST na API → optimistický `setProfile()` → po 600 ms refetch → `setProfile(serverData)`.
3. **Každých 30 s** → refetch a `setProfile(serverData)`.

Riziko: Krok 2 refetch může vrátit data bez nového záznamu → přepíšeme optimistický stav.

---

## 2. Návrh nového systému

### Zásady

- **Jedna pravda**: Stav profilu = `profile` v React state. Vše se odvozuje od něj.
- **Optimistické aktualizace**: Po přidání/smazání hned upravit state; UI reaguje okamžitě.
- **Refetch s ochranou**: Po mutaci refetch až po prodlevě (1 s), aby API stihlo vrátit nová data. Případně nepřepisovat stav, pokud server vrátí méně záznamů než máme (ochrana před „stale“ přepsáním).
- **Obnova při návratu**: Při návratu na záložku (visibility) provést refetch → vždy čerstvá data.
- **Spolehlivé načtení**: Timeout prvního načtení (např. 15 s) + srozumitelná chybová hláška a tlačítko „Obnovit“.

### Konkrétní změny v kódu

1. **Timeout načítání**  
   V `useEffect` pro první načtení: pokud do 15 s profil nenahrajeme, zavolat `setLoading(false)` a `setError('Načítání trvalo příliš dlouho…')`.

2. **Refetch při návratu na záložku**  
   `useEffect` s posluchačem `visibilitychange`: když `document.visibilityState === 'visible'`, provést `refetchProfile()` (s aktuálním tokenem).

3. **Prodleva refetch po mutaci**  
   Po přidání tréninku/váhy nebo smazání tréninku: jediný refetch spustit po **1000 ms**. Žádný druhý pokus hned za sebou (snížení šance na přepsání starými daty).

4. **Ochrana před přepsáním starými daty (volitelně)**  
   Při aplikování odpovědi refetchu: pokud máme v state víc tréninků nebo víc měření než server vrátil, stav neprepisovat a naplánovat jeden dodatečný refetch (např. po 500 ms). Tím se zabrání ztrátě právě přidaného záznamu.

5. **API profile**  
   Do odpovědi `/api/profile` přidat hlavičky `Cache-Control: no-store, no-cache` a `Pragma: no-cache`, aby se odpověď necacheovala.

6. **UX**  
   Zachovat toasty po akcích, tlačítko „Obnovit přehled“ a text typu „Data se přepočítají hned po každé akci“.

---

## 3. Shrnutí pro uživatele

- **Interaktivita**: Každá akce (přidat trénink, váhu, smazat) okamžitě změní čísla, graf a postavu díky optimistickým aktualizacím.
- **Automatizace**: Data se obnovují každých 30 s, při návratu na záložku a po uložení (s prodlevou).
- **Přívětivost**: Timeout při prvním načtení, jasné chybové hlášky a možnost obnovit stránku nebo přehled.

Implementace těchto bodů je provedena v `pages/profil.js` a `pages/api/profile.js`.
