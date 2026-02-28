# Kalendář trenéra (info@) – proč zápis stále hlásí chybu a co zkontrolovat

## Jak to má fungovat

- **info@bodyandmindon.cz** = účet trenéra. V aplikaci má v `.env` / na Vercelu `TRAINER_EMAIL=info@bodyandmindon.cz`.
- Trenér (info@) v sekci „Kdy mám trénink?“ **vidí všechny své události** (organizátor kalendáře = vždy vidí své události).
- Ostatní profily (klienti) vidí jen události přiřazené jim („Pro: email“ nebo účastníci).
- **Zápis** (Přidat trénink do kalendáře) vyžaduje, aby token z OAuth měl oprávnění pro zápis. Pokud ho nemá, zobrazí se: *„Pozvánky odeslány… Pro zápis i do kalendáře trenéra propoj kalendář znovu.“*

## Proč zápis do kalendáře trenéra stále padá (403)

Aplikace už při propojení kalendáře žádá plný přístup k Calendar API (`https://www.googleapis.com/auth/calendar`). Chyba 403 „insufficient authentication scopes“ znamená jednu z těchto věcí:

### 1. Scope není v OAuth consent screen (nejčastější)

Token od Google obsahuje jen ty scope, které máš **v projektu** v OAuth consent screen. Pokud tam scope pro Calendar API (zápis) není, i po „propojení znovu“ dostaneš token bez zápisu.

**Co udělat:**

1. Otevři **Google Cloud Console**: https://console.cloud.google.com/
2. Vyber projekt, ve kterém máš OAuth klienta (ten samý, kde je `GOOGLE_CALENDAR_CLIENT_ID`).
3. **APIs & Services** → **OAuth consent screen** → **Edit app** (nebo Upravit aplikaci).
4. V sekci **Scopes** klikni **Add or Remove Scopes** (Přidat nebo odebrat rozsahy).
5. Vyhledej **Google Calendar API** a přidej scope:
   - **„See, edit, share, and permanently delete all the calendars that you can access in Google Calendar“**  
   - (odpovídá `https://www.googleapis.com/auth/calendar`)
6. Ulož (Save and Continue).
7. **Znovu propoj kalendář** v aplikaci: Admin → „Propojit Google Kalendář (info@)“ nebo odkaz  
   `https://app.bodyandmindon.cz/api/auth/google-calendar/connect?key=TVŮJ_ADMIN_TOKEN`  
   Přihlas se jako **info@**, na consent obrazovce by se teď měla objevit i oprávnění k Calendar API a potvrzení uloží nový token včetně zápisu.

### 2. Reálně jsi kalendář nepropojoval znovu po úpravě scope

Po přidání scope v Console musí trenér **jednou znovu** projít OAuth (kliknout na Propojit Google Kalendář a přihlásit se jako info@). Starý token v DB nemá nový scope; nový token z tohoto kroku už ho má.

### 3. Režim „Testing“ a test users

Je-li OAuth consent screen v režimu **Testing**, pouze účty v seznamu **Test users** mohou aplikaci autorizovat. Přidej **info@bodyandmindon.cz** mezi Test users, nebo přepni aplikaci do **Production**, aby se mohl přihlásit kdokoli (u vnitřní aplikace stačí test users).

## Shrnutí

- **Čtení** (trenér vidí své tréninky v aplikaci): funguje, pokud je kalendář propojený a přihlášený je info@ (organizátor vidí všechny své události).
- **Zápis** (Přidat trénink do kalendáře): bude fungovat, až v Google Cloud Console přidáš scope Calendar API (viz bod 1) a pak **znovu** propojíš kalendář (bod 2).
- E-mailové pozvánky se posílají vždy; nezávisí na zápisu do kalendáře trenéra.
