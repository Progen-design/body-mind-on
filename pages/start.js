import ProgramForm from "../components/ProgramForm";

export default function StartPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0c0c24] via-[#111133] to-[#000010] text-white font-sans">
      {/* Hero */}
      <section className="flex flex-col justify-center items-center text-center py-32 px-6 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/hero-bg.jpg')" }}>
        <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-[#8ab4ff] to-[#b388ff] bg-clip-text text-transparent drop-shadow-lg">
          Body and Mind ON – Zapni své tělo i mysl
        </h1>
        <p className="text-gray-300 text-lg md:text-xl max-w-2xl mb-8 leading-relaxed">
          Získej osobní plán tréninku, jídelníčku a regenerace v kombinaci AI systému a kouče ve
          prémiových plánech. Začni 7denní START zdarma a objev svůj nový potenciál.
          <br />
          <span className="text-[#7DF9FF]">Tvůj osobní plán bude připraven během 2 minut.</span>
        </p>
        <a
          href="#formular"
          className="inline-block px-10 py-4 bg-gradient-to-r from-[#7DF9FF] to-[#9A7DFF] text-black font-semibold rounded-xl text-lg shadow-lg hover:scale-105 transition"
        >
          ⚡ Začni 7denní START zdarma
        </a>
        <p className="text-gray-400 text-sm mt-4">Bez rizika, bez karty, jen výsledek.</p>
      </section>

      {/* Jak to funguje */}
      <section className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-4xl font-bold mb-8 text-[#9ebaff]">Jak to funguje</h2>
          <p className="text-gray-300 mb-8">
            S Body & Mind ON funguje všechno rychle, přehledně a bez stresu.
          </p>
          <div className="space-y-6">
            {[
              {
                icon: "📝",
                title: "Vyplníš krátký kvíz",
                text: "Sdílíš své cíle, možnosti a zdravotní stav v jednoduchém dotazníku.",
              },
              {
                icon: "🤖",
                title: "AI vytvoří tvůj plán",
                text: "Systém během 2 minut připraví osobní tréninkový a jídelní plán přesně pro tebe.",
              },
              {
                icon: "📈",
                title: "Sleduješ pokroky",
                text: "V aplikaci vidíš výsledky a každý týden dostáváš doporučení od AI trenéra.",
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start space-x-4">
                <div className="text-3xl">{item.icon}</div>
                <div>
                  <h3 className="text-xl font-semibold mb-1 text-[#8ab4ff]">
                    {item.title}
                  </h3>
                  <p className="text-gray-400">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
          <a
            href="#formular"
            className="inline-block mt-10 px-8 py-3 bg-gradient-to-r from-[#7DF9FF] to-[#9A7DFF] text-black font-semibold rounded-xl shadow-lg hover:scale-105 transition"
          >
            ⚡ Získat svůj plán zdarma
          </a>
        </div>

        <div className="hidden md:block">
          <img
            src="/images/phone-preview.png"
            alt="Ukázka aplikace"
            className="rounded-3xl shadow-2xl w-full"
          />
        </div>
      </section>

      {/* Formulář */}
      <section
        id="formular"
        className="py-24 bg-[#0b0b1d] border-t border-[#1a1a3a] text-center"
      >
        <h2 className="text-4xl font-bold mb-10 text-[#9ebaff]">
          Aktivuj svůj osobní plán START
        </h2>
        <div className="max-w-3xl mx-auto">
          <ProgramForm planType="START" />
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-gray-500 py-10 border-t border-[#1a1a3a] text-sm">
        © 2025 Body & Mind ON • Všechna práva vyhrazena
      </footer>
    </main>
  );
}
