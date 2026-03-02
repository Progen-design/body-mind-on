# Instrukce pro OpenAI Asistenta – sekce Trénink

**Kompletní instrukce k vložení do asistenta** jsou v souboru **`OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md`** – zkopíruj odtud celý text do platform.openai.com → Assistants → Body and Mind ON → Instructions.

## Trénink jako jeden z hlavních bodů

- Sekce **Trénink** musí být vždy **rozvinutá** (4–5 odstavců), ne jedna věta.
- Povinně: doporučené dny a frekvence, rozcvička 5–10 min, hlavní část (cviky, série), závěr strečink, progrese a bezpečnost.
- Volitelně: typ postavy (ektomorf / mezomorf / endomorf) a jak přizpůsobit trénink; 1–2 obrázky (URL z Unsplash) pro představu cviku nebo motivaci.

## Kde se trénink zobrazuje

- E-mail **„Tvůj plán je připraven“** – sekce Trénink je zvýrazněná jako karta.
- **Profil** – celý plán v sekci Můj plán.
- **Denní digest** – úryvek z tréninkového plánu v bloku „Z tvého plánu – trénink“.

Pokud asistent i tak vrátí jen jednu větu, aplikace doplní výchozí trenérský blok automaticky (fallback v `lib/generatePlan.js`).
