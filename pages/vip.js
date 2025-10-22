import ProgramForm from "../components/ProgramForm";

export default function VipProgram() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4 text-purple-400">
          VIP Coaching – Maximální podpora
        </h1>
        <p className="text-gray-300 mb-8">
          Osobní vedení s trenérem, AI koučem a lidským přístupem. Konzultace
          1:1, priority a pokročilé strategie.
        </p>
      </div>

      <ProgramForm planType="VIP" />
    </div>
  );
}
