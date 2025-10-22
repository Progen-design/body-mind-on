import ProgramForm from "../components/ProgramForm";

export default function StartPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b0b0b] via-[#121212] to-black text-white font-sans">
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-12 text-center">
        <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent drop-shadow-lg">
          START Program – Začni zdarma
        </h1>
        <p className="text-gray-300 text-lg md:text-xl leading-relaxed max-w-3xl mx-auto">
          Vyzkoušej systém bez rizika — během pár minut získáš osobní plán
          tréninku, jídelníčku i regenerace zdarma.  
          <br />
          <span className="text-green-400 font-semibold">
            První týden zcela zdarma, bez závazků.
          </span>
        </p>
        <a
          href="#formular"
          className="mt-10 inline-block px-10 py-4 bg-green-500 hover:bg-green-600 text-black font-semibold rounded-xl text-lg transition-all shadow-lg shadow-green-800/30"
        >
          Začít zdarma 🚀
        </a>
      </section>

      {/* Výhody */}
      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-8 text-center">
        <div className="bg-neutral-900 rounded-2xl p-8 shadow-lg border border-neutral-800 hover:border-green-500 transition">
          <h3 className="text-green-400 text-xl font-bold mb-3">💪 Tréninkový plán</h3>
          <p className="text-gray-400">
            AI trenér ti sestaví cvičební plán přesně podle tvých cílů a možností.
          </p>
        </div>
        <div className="bg-neutral-900 rounded-2xl p-8 shadow-lg border border-neutral-800 hover:border-green-500 transition">
          <h3 className="text-green-400 text-xl font-bold mb-3">🥗 Jídelníček</h3>
          <p className="text-gray-400">
            Každý týden dostaneš nový personalizovaný jídelníček z běžně dostupných surovin.
          </p>
        </div>
        <div className="bg-neutral-900 rounded-2xl p-8 shadow-lg border border-neutral-800 hover:border-green-500 transition">
          <h3 className="text-green-400 text-xl font-bold mb-3">🧘 Regenerace</h3>
          <p className="text-gray-400">
            Tipy na spánek, regeneraci a mindset na základě tvého životního stylu.
          </p>
        </div>
      </section>

      {/* Formulář */}
      <section
        id="formular"
        className="bg-neutral-950 border-t border-neutral-800 py-20 px-6"
      >
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-10 bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent">
            Aktivuj svůj osobní plán START
          </h2>
          <ProgramForm planType="START" />
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-gray-500 py-10 border-t border-neutral-800 text-sm">
        © 2025 Body & Mind ON • Všechna práva vyhrazena
      </footer>
    </main>
  );
}
