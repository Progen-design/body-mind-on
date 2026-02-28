# Kalendář trenéra – zápis a pozvánky (Souhlasím / Nesouhlasím)

## Jak má pozvánka fungovat

- **Správně:** Trenér přidá trénink a vyplní e-maily klientů. Událost se **zapíše do Google Kalendáře** trenéra (info@). **Google pak sám pošle** každému klientovi e-mail s **pozvánkou na událost** – v e-mailu jsou tlačítka **Přijmout / Odmítnout / Možná**. Klient klikne na Přijmout a událost se mu zapíše do kalendáře. To je „souhlasím / nesouhlasím“.
- **Když zápis do kalendáře selže:** Aplikace pošle zálohu – e-mail s odkazem „Přidat do Google Kalendáře“ (klient si událost přidá ručně). Není to pozvánka s Přijmout/Odmítnout.

Aby klienti dostali **skutečnou pozvánku (Přijmout/Odmítnout)**, musí zápis do tvého Google Kalendáře **projít**. K tomu je potřeba správně nastavit oprávnění v Google Cloud a znovu propojit kalendář.

---

## Chyba oprávnění – jasný postup (krok za krokem)

Když vidíš hlášku **„Trénink se nepodařilo zapsat do tvého Google Kalendáře“** nebo chybu s oprávněním (403), postupuj v tomto pořadí:

### Krok 1: Otevři Google Cloud Console

1. Jdi na **https://console.cloud.google.com/**
2. Přihlas se účtem, pod kterým máš vytvořený projekt (OAuth klienta pro aplikaci).
3. V horním výběru **projektu** zvol ten projekt, ve kterém máš nastavené **OAuth 2.0 Client ID** (ten samý, jehož hodnoty máš v `GOOGLE_CALENDAR_CLIENT_ID` a `GOOGLE_CALENDAR_CLIENT_SECRET` na Vercelu / v `.env`).

### Krok 2: Přidej scope pro Google Calendar API

1. V levém menu: **APIs & Services** → **OAuth consent screen** (OAuth úvodní obrazovka).
2. Klikni na **EDIT APP** (Upravit aplikaci).
3. Projdi kroky (App information, User type) až na **Scopes** (Rozsahy oprávnění).
4. U sekce **Scopes** klikni na **ADD OR REMOVE SCOPES** (Přidat nebo odebrat rozsahy).
5. Do vyhledávání zadej **Google Calendar** nebo **calendar**.
6. Zaškrtni scope:
   - **„See, edit, share, and permanently delete all the calendars that you can access in Google Calendar“**
   - (v seznamu může být zkráceně „.../auth/calendar“)
7. Klikni **Update** (Aktualizovat) a pak **Save and Continue** (Uložit a pokračovat).
8. Dokonči úpravu aplikace (Save and Continue až na konec).

### Krok 3: Znovu propoj kalendář v aplikaci

Starý token v databázi **nemá** nové oprávnění. Je nutné **jednou znovu** projít OAuth:

1. V aplikaci jdi do **Admin** (odkaz s parametrem `?key=TVŮJ_ADMIN_TOKEN`) nebo na stránku, kde je odkaz **„Propojit Google Kalendář“**.
2. Klikni na **Propojit Google Kalendář** (nebo otevři odkaz na propojení).
3. Přihlas se účtem **info@bodyandmindon.cz** (nebo jiným e-mailem trenéra z `TRAINER_EMAIL`).
4. Na obrazovce od Google uvidíš žádost o přístup k kalendáři – **Povolit** / **Allow**.
5. Po přesměrování zpět do aplikace by měla být zpráva, že kalendář je propojen.

Od tohoto okamžiku má uložený token oprávnění i pro **zápis**. Přidání tréninku s e-maily klientů by mělo projít a klienti dostanou od Google e-mail s pozvánkou (Přijmout / Odmítnout).

### Krok 4: Ověř, že Google Calendar API je zapnuté

1. V Google Cloud Console: **APIs & Services** → **Library** (Knihovna).
2. Vyhledej **Google Calendar API**.
3. Otevři ji a zkontroluj, že je **ENABLED** (Zapnuto). Pokud ne, klikni **Enable**.

### Krok 5: Testování (režim Testing) – jen pokud používáš Testing

1. **APIs & Services** → **OAuth consent screen**.
2. Je-li režim **Testing**, pouze účty v **Test users** mohou aplikaci autorizovat.
3. Přidej **info@bodyandmindon.cz** (tvůj trenérský e-mail) do **Test users**, nebo přepni aplikaci do **Production**, aby mohl přihlášení projít.

---

## Shrnutí kontroly

| Co zkontrolovat | Kde |
|-----------------|-----|
| Scope Calendar API (See, edit, share…) | OAuth consent screen → Scopes → Add or Remove Scopes |
| Kalendář znovu propojen po přidání scope | Admin → Propojit Google Kalendář, přihlásit se jako info@ |
| Google Calendar API zapnutá | APIs & Services → Library → Google Calendar API → Enable |
| Test users (pokud Testing) | OAuth consent screen → Test users – přidat info@ |

Po těchto krocích by měl zápis do kalendáře fungovat a klienti budou dostávat **pozvánku na událost** (Přijmout / Odmítnout) přímo od Google.
