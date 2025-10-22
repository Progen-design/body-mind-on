import ProgramForm from "../components/ProgramForm";
import LayoutSection from "../components/LayoutSection";

export default function StartPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0221] via-[#0b0325] to-[#000000] text-white font-sans">
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-32 pb-20 text-center">
        <h1 className="text-6xl md:text-7xl font-extrabold mb-6 bg-gradient-to-r from-[#00FF87] via-[#00F5C0] to-[#7DF9FF] bg-clip-text text-transparent">
          START Program
        </h1>
        <p className="text-gray-300 text-xl leading-relaxed max-w-3xl mx-auto">
          Získej svůj osobní plán tréninku, jídelníčku a regenerace během pár minut.
          <br />
          <span className="text-[#00FF87] font-semibold">První týden zcela zdarma – bez závazků.</span>
        </p>
        <a
          href="#formular"
          className="inline-block mt-10 px-10 py-4 bg-[#00FF87] hover:bg-[#00F5C0] text-black font-semibold rounded-2xl text-lg shadow-lg shadow-green-500/30 transition-transform hover:scale-105"
        >
          Začít zdarma 🚀
        </a>
      </section>

      {/* Výhody */}
      <LayoutSection title="Co získáš se START programem">
        <div className="grid md:grid-cols-3 gap-8 mt-10">
          {[
            {
              icon: "💪",
              title: "AI Tréninkový plán",
              text: "Plán vytvořený přesně podle tvých cílů, úrovně a možností.",
            },
            {
              icon: "🥗",
              title: "Personalizovaný jídelníček",
              text: "Z českých surovin s přehledem makroživin a doporučeními.",
            },
            {
              icon: "🧘",
              title: "Regenerace a mindset",
              text: "Doporučení pro spánek, regeneraci a mentální rovnováhu.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-[#101020]/80 rounded-2xl p-8 border border-[#1f1f2e] hover:border-[#00FF87] transition shadow-lg"
            >
              <div className="text-4xl mb-4">{item.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
              <p className="text-gray-400">{item.text}</p>
            </div>
          ))}
        </div>
      </LayoutSection>

      {/* Formulář */}
      <LayoutSection title="Aktivuj svůj osobní plán START">
        <ProgramForm planType="START" />
      </LayoutSection>

      {/* Footer */}
      <footer className="text-center text-gray-500 py-10 border-t border-[#202030] text-sm">
        © 2025 Body & Mind ON • Všechna práva vyhrazena
      </footer>
    </main>
  );
}
