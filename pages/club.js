import ProgramForm from "../components/ProgramForm";

export default function ClubProgram() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4 text-yellow-400">
          ON Club – Doporučeno
        </h1>
        <p className="text-gray-300 mb-8">
          Komplexní měsíční proměna s AI trenérem 24/7. Každý týden nový plán,
          statistiky a přehled výsledků.
        </p>
      </div>

      <ProgramForm planType="ON_CLUB" />
    </div>
  );
}
