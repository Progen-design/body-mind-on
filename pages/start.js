import React from "react";
import Link from "next/link";
import PricingForm from "./pricing"; // používáme stávající formulář

export default function StartPage() {
  return (
    <div className="min-h-screen bg-[#0b0121] text-white">
      {/* Hero sekce */}
      <section className="text-center py-16 px-4 max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Body & Mind ON – START program
        </h1>
        <p className="text-lg text-gray-300 mb-6">
          Začni svou cestu k lepšímu tělu i mysli. Během pár minut získáš
          osobní plán tréninku, jídelníčku a regenerace zdarma.
        </p>

        <ul className="text-left inline-block text-gray-200 space-y-2 mb-6">
          <li>✅ AI ti připraví přizpůsobený plán na základě tvých údajů</li>
          <li>✅ Každý týden dostaneš nový plán dle pokroku</li>
          <li>✅ 100% bez rizika – první týden zcela zdarma</li>
        </ul>

        <Link href="#formular">
          <button className="mt-4 bg-[#2ECC71] hover:bg-[#27AE60] text-white px-8 py-3 rounded-lg font-semibold transition-all">
            Chci začít zdarma
          </button>
        </Link>
      </section>

      {/* Jak to funguje */}
      <section className="bg-[#120a33] py-12 text-center">
        <h2 className="text-3xl font-bold mb-6">Jak to funguje</h2>
        <div className="max-w-3xl mx-auto text-gray-300 space-y-4">
          <p>1️⃣ Vyplníš údaje o sobě (věk, váha, aktivita…)</p>
          <p>2️⃣ AI vytvoří osobní plán během pár minut</p>
          <p>3️⃣ Plán ti přijde e-mailem a bude dostupný ve tvém profilu</p>
        </div>
      </section>

      {/* Výhody */}
      <section className="py-12 text-center">
        <h2 className="text-3xl font-bold mb-6">Co získáš</h2>
        <ul className="text-gray-300 space-y-2 max-w-2xl mx-auto">
          <li>🍽️ Týdenní jídelníček na míru</li>
          <li>💪 Osobní tréninkový plán</li>
          <li>🧠 Tipy pro regeneraci a spánek</li>
          <li>🚀 Možnost přejít na ON Club / VIP Coaching</li>
        </ul>
      </section>

      {/* Formulář */}
      <section id="formular" className="py-16 bg-[#0b0121] border-t border-gray-700">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-8">Vyplň své údaje</h2>
          <PricingForm />
        </div>
      </section>
    </div>
  );
}
