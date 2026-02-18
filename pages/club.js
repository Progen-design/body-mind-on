import ProgramForm from "../components/ProgramForm";

export default function ClubPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4 text-yellow-400">
          ON Club – Kompletní měsíční proměna
        </h1>
        <p className="text-gray-300 mb-8">
          Kompletní měsíční proměna s tvým osobním AI trenérem 24/7. Každý týden
          nový plán podle výsledků, přehled statistik a komunita.
        </p>
      </div>
      <ProgramForm planType="ON_CLUB" />
    </div>
  );
}
