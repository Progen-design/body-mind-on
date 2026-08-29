# Registrace přes prohlížeč — 29. 8. 2026

Šestý účet, tentokrát ostrou cestou přes UI na `app.bodyandmindon.cz/start`,
ne přes API. Účet `janprikopa+t6@gmail.com`, heslo `BmonTest2026!`.

Zadáno: žena, 15. 3. 1992, 165 cm, 62 kg, střední aktivita, nízký stres,
sedavé zaměstnání, redukce, 2–3× týdně, Po/St/Pá, doma s vybavením
(jednoručky + odporové gumy), **vegetarián**, návyky zdravá strava,
kvalitní spánek, pitný režim.

## Co funguje

Celých pět kroků prošlo. Validace na kroku 2 správně zastavila postup, dokud
nebylo vyplněné pohlaví.

V databázi sedí všechno: `trial/START` do 5. 9., `165 cm / 62 kg /
vegetarian / redukce`, **3 návyky**, plán na 7 dní, 1436 kcal.

Po načtení profilu svítí **`TRIAL · 7 DNÍ`** — jantarová pilulka z etapy 5.9,
poprvé ověřená na živém účtu. Uvítací zpráva od TEDa je personalizovaná
podle zadání („krátké cvičení s jednoručkami").

## VADA: po registraci svítí data předchozího uživatele

Hned po dokončení registrace, **bez znovunačtení stránky**, profil nového
účtu ukazoval:

```
zobrazeno hned po registraci        skutečnost
Věk 38 let                          34 let
Výška 188 cm                        165 cm
Váha 106,3 kg                       62,0 kg
Tělesný tuk 13,7 %                  žádné měření
Svalová hmota 84,7 kg               žádné měření
BMI 31,0                            žádné měření
Cílová hmotnost 102 kg              nenastavena
Člen od 3. 8. 2026                  29. 8. 2026
Withings Body Scan: Připojeno       žádné zařízení
Apple Health: odesláno před 17 min  žádná data
Odznak AKTIVNÍ                      TRIAL · 7 DNÍ
```

Byla to data účtu, který byl v tom prohlížeči přihlášený předtím. **Po
`F5` je všechno správně** — server tedy vrací správná data a o únik mezi účty
na serveru nejde. Vadný je klient: SPA po přihlášení nového uživatele
nezahodí stav předchozího.

Dopad není kosmetický. Na sdíleném počítači uvidí nově registrovaný člověk
váhu, tělesný tuk, svalovou hmotu a připojená zařízení někoho jiného. A i
sám pro sebe dostane úplně špatný první dojem — 106 kg místo 62.

Oprava patří tam, kde se mění přihlášený uživatel: stav profilu, vážení,
plánu a zařízení musí spadnout na prázdno při každé změně `user.id`, ne až
při dalším načtení stránky.

## Stále chybí cena a délka trialu

Ani v jednom z pěti kroků nestojí, kolik program stojí a že zkušební období
trvá 7 dní. Nález z 3. 8., pořád otevřený. U předplatného se zkušební dobou
musí být cena uvedená předem — je to i právní věc, nejen konverzní.
