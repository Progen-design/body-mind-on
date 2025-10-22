import ProgramForm from "../components/ProgramForm";

export default function StartProgram() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-black text-white p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4 text-green-400">
          START Program – Začni zdarma
        </h1>
        <p className="text-gray-300 mb-8">
          Vyzkoušej systém bez rizika — během pár minut získáš osobní plán
          tréninku, jídelníček i regeneraci od našeho AI asistenta.
        </p>
      </div>

      <ProgramForm planType="START" />
    </div>
  );
}
