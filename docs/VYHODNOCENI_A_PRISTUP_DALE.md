# Vyhodnocení a doporučený přístup k dalšímu rozvoji

*Cíl: uživatel má **všechno najednou**. Dodáme to v **jednom uceleném release**.*

---

## 1. Cíl: uživatel má všechno najednou

Uživatel by od prvního dne měl mít **kompletní zážitek** – ne „nejdřív základ, pak až další funkce“. Po registraci a přihlášení má v profilu k dispozici:

- osobní plán a jídelníček na týden  
- recepty (odkazy → modal, s cache)  
- **nákupní seznam** z receptů  
- **poslat plán znovu** e-mailem  
- **výměnu jídla** (swap) u konkrétního jídla  
- **export** jídelníčku (týden jako text/PDF)  
- **milníky** (plán připraven, první trénink, týden s námi)  
- **mindset / motivační prvky** v UI (věta u týdne nebo dne)  
- krátké **„proč“** u polí v registraci a **onboarding po krocích** (aby to nebyl jeden dlouhý formulář, ale přitom vše zůstalo v jednom flow)

Žádné čekání na „fáze“ – **vše v jednom produktu, hned**.

---

## 2. Kde jste teď (stručné vyhodnocení)

### Co funguje a na čem stavět

| Oblast | Stav | Poznámka |
|--------|------|----------|
| **Registrace (START)** | Funkční | Jedna stránka, údaje + strava/omezení, e-mail s plánem, odkaz na /login. |
| **Přihlášení a profil** | Funkční | Plán v profilu, jídelníček po dnech, recepty jako odkazy, tréninky, progres. |
| **AI plán** | Funkční | Generování z body_metrics, diet_type + preferences, uložení do DB a e-mail. |
| **Recepty** | Zoptimalizováno | Odkazy + modal, cache 5 min. |
| **Data** | Srozumitelná | body_metrics, plány, tréninky. |

### Co chybí, aby byl „všechno najednou“

1. Onboarding po krocích + „proč“ u polí (stále jeden dlouhý formulář).  
2. Milníky v profilu (plán připraven, první trénink, týden).  
3. Nákupní seznam z receptů.  
4. „Poslat plán znovu“.  
5. Výměna jídla (swap).  
6. Export jídelníčku.  
7. Mindset / motivační prvek v UI.  
8. Motivační zpráva po akci (např. po zapsaném tréninku).  
9. Ceník / hodnota na landingu (volitelně).

---

## 3. Přístup: jeden release – všechno najednou

**Princip:** Všechny body výše dodáme v **jednom uceleném balíku** (jeden velký release), ne po fázích. Uživatel pak má od prvního dne plný produkt.

### Balík úkolů (v jednom release)

| # | Úkol | Uživatel z toho má |
|---|------|---------------------|
| 1 | **Onboarding po krocích** (3–4 kroky, progress bar, stejná data jako dnes) | Přehledný vstup, méně přetížení, pocit postupu. |
| 2 | **„Proč“ u polí** (aktivita, cíl, strava) | Jasno, proč údaje vyplňovat. |
| 3 | **Milníky v profilu** (plán připraven, první trénink, týden) | Okamžitou zpětnou vazbu a „co dál“. |
| 4 | **Nákupní seznam** z receptů na týden | Jednu akci: co koupit – hned. |
| 5 | **„Poslat plán znovu“** (tlačítko v profilu) | Plán v e-mailu kdykoli, bez hledání. |
| 6 | **Výměna jídla (swap)** u jídla v jídelníčku | Kontrolu nad plánem, ne statický blok. |
| 7 | **Export jídelníčku** (týden jako text / PDF) | Sdílení, tisk, použití mimo app. |
| 8 | **Mindset prvek v UI** (jedna věta u týdne nebo u dne) | „Mind“ vidět na první pohled. |
| 9 | **Motivační zpráva po akci** (např. po zapsaném tréninku) | Okamžitou podporu. |
| 10 | **Ceník / hodnota na landingu** (např. „místo X za trenéra“) | Důvěru a jasnou hodnotu. |

### Pořadí implementace v rámci release (technická priorita)

- Nejprve **onboarding po krocích + „proč“** (ovlivňuje celý vstup).  
- Pak **profil**: milníky, „Poslat plán znovu“, nákupní seznam, swap, export (vše v jednom místě).  
- Potom **mindset + motivační zprávy** (texty a drobné UI).  
- Nakonec **landing** (ceník / hodnota).

V rámci tohoto pořadí lze úkoly paralelizovat (např. backend pro nákupní seznam a export zároveň s úpravami formuláře).

---

## 4. Jak na to v praxi

- **Jeden release** = jeden nasazený balík, po kterém má uživatel „všechno najednou“.  
- **Jednotlivé úkoly** lze rozdělit mezi více lidí nebo dělat v blocích (nejdřív formulář + profil, pak texty + landing).  
- **Testování:** před nasazením otestovat celý flow: registrace (všechny kroky) → přihlášení → profil včetně milníků, nákupního seznamu, „poslat znovu“, swap, export, motivace.  
- **Dokumentace:** po release mít v jednom místě seznam, co uživatel „má najednou“ (tento dokument + stručný changelog).

---

## 5. Shrnutí v jedné větě

**Cíl je, aby uživatel měl všechno najednou; tomu odpovídá jeden ucelený release, v němž dodáme krokový onboarding, „proč“, milníky, nákupní seznam, poslat plán znovu, swap, export, mindset v UI a motivační zprávy – bez rozdělování do fází.**  
Na tom pak jde dál stavět (např. kalendář, sken jídla) jako na hotovém „full“ produktu.

---

*Dokument navazuje na [PRUZKUM_A_NAPADY_NA_VYLEPSENI.md](./PRUZKUM_A_NAPADY_NA_VYLEPSENI.md) a lze ho upravovat podle výsledků a priorit.*
