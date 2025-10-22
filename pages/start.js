import ProgramForm from "../components/ProgramForm";

export default function StartPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-neutral-900 to-black text-white font-sans">
      {/* Sekce hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-green-400 via-teal-400 to-blue-400 bg-clip-text text-transparent">
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

        <div className="mt-10 flex justify-center">
          <a
            href="#formular"
            className="px-8 py-4 bg-green-500 hover:bg-green-600 text-black font-semibold rounded-xl text-lg transition-all shadow-lg shadow-green-800/30"
          >
            Začít zdarma 🚀
          </a>
        </div>
      </section>

      {/* Sekce s výhodami */}
      <section className="max-w-6xl mx-auto px-6 py-12 grid md:grid-cols-3 gap-8 text-center">
        <div className="bg-neutral-900 rounded-2xl p-6 shadow-lg border border-neutral-800 hover:border-green-500 transition">
          <h3 className="text-green-400 text-xl font-bold mb-3">💪 Tréninkový plán</h3>
          <p className="text-gray-400">
            AI trenér ti sestaví trénink přesně podle tvých cílů a možností.
          </p>
        </div>
        <div className="bg-neutral-900 rounded-2xl p-6 shadow-lg border border-neutral-800 hover:border-green-500 transition">
          <h3 className="text-green-400 text-xl font-bold mb-3">🥗 Jídelníček</h3>
          <p className="text-gray-400">
            Každý týden dostaneš nový personalizovaný plán stravy z běžných surovin.
          </p>
        </div>
        <div className="bg-neutral-900 rounded-2xl p-6 shadow-lg border border-neutral-800 hover:border-green-500 transition">
          <h3 className="text-green-400 text-xl font-bold mb-3">🧠 Regenerace</h3>
          <p className="text-gray-400">
            Doporučení pro spánek, regeneraci a mindset na základě tvého životního stylu.
          </p>
        </div>
      </section>

      {/* Sekce formuláře */}
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
        © 2025 Body & Mind ON • Všechny práva vyhrazena
      </footer>
    </main>
  );
}
