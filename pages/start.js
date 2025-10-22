import ProgramForm from "../components/ProgramForm";

export default function StartPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* Sekce headeru */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-[#22c55e]">
          START Program – Začni zdarma
        </h1>
        <p className="text-gray-300 text-lg md:text-xl leading-relaxed">
          Začni svou cestu k lepšímu tělu i mysli. Během pár minut získáš osobní
          plán tréninku, jídelníčku i regenerace zdarma — díky kombinaci umělé
          inteligence a zkušeností trenérů.
        </p>

        <div className="mt-10 flex justify-center">
          <button className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-semibold px-8 py-3 rounded-lg text-lg transition">
            🔥 Začít zdarma
          </button>
        </div>
      </section>

      {/* Sekce formuláře */}
      <section className="bg-neutral-900 border-t border-neutral-800 py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">
            Vyplň své údaje a aktivuj plán zdarma
          </h2>

          <ProgramForm planType="START" />
        </div>
      </section>
    </main>
  );
}
