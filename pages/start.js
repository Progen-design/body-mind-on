import React from "react";
import Link from "next/link";
import PricingForm from "./pricing";

export default function StartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0121] via-[#1b0640] to-[#2a0a6e] text-white">
      {/* Hero sekce */}
      <section className="text-center py-24 px-6 max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-[#9b5cff] to-[#2ECC71] text-transparent bg-clip-text">
          Body & Mind ON – START program
        </h1>

        <p className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed mb-8">
          Začni svou cestu k <span className="text-[#2ECC71] font-semibold">silnějšímu tělu i mysli</span>.
          Během pár minut získáš osobní plán tréninku, jídelníčku a regenerace zdarma — díky
          kombinaci umělé inteligence a zkušeností trenérů.
        </p>

        <Link href="#formular">
          <button className="bg-[#2ECC71] hover:bg-[#27AE60] text-black font-semibold px-10 py-4 rounded-full text-lg transition-transform hover:scale-105">
            💪 Chci začít zdarma
          </button>
        </Link>
      </section>

      {/* Jak to funguje */}
      <section className="py-20 bg-[#11042f]/60 backdrop-blur-md text-center border-t border-[#2ECC71]/20">
        <h2 className="text-4xl font-bold mb-10 text-[#9b5cff]">Jak to funguje</h2>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto px-6">
          {[
            {
              emoji: "🧠",
              title: "1. Vyplníš údaje",
              text: "Zadej věk, váhu, výšku a cíle. AI tě hned pozná a připraví individuální plán.",
            },
            {
              emoji: "⚙️",
              title: "2. AI vytvoří plán",
              text: "Umělá inteligence navrhne jídelníček i trénink přesně podle tebe.",
            },
            {
              emoji: "📬",
              title: "3. Dostaneš e-mailem",
              text: "Plán přijde do tvé schránky i do aplikace — a každý týden se aktualizuje.",
            },
          ].map((step, index) => (
            <div
              key={index}
              className="bg-[#1b0d3d] p-8 rounded-2xl shadow-lg hover:shadow-[#2ECC71]/40 transition-all"
            >
              <div className="text-5xl mb-4">{step.emoji}</div>
              <h3 className="text-2xl font-semibold mb-3 text-[#2ECC71]">
                {step.title}
              </h3>
              <p className="text-gray-300 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Co získáš */}
      <section className="py-20 text-center bg-[#0d0229]/60 border-t border-[#9b5cff]/20">
        <h2 className="text-4xl font-bold mb-10 text-[#2ECC71]">Co získáš</h2>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto px-6 text-left">
          {[
            {
              icon: "🍽️",
              title: "Týdenní jídelníček na míru",
              desc: "Recepty z běžných českých surovin — s makry a kaloriemi přesně pro tvé cíle.",
            },
            {
              icon: "🏋️‍♂️",
              title: "Osobní tréninkový plán",
              desc: "Trénuj doma nebo v gymu. AI vybírá cviky podle tvé kondice i vybavení.",
            },
            {
              icon: "🧘‍♀️",
              title: "Regenerace a spánek",
              desc: "Zlepši kvalitu odpočinku a zvládni stres pomocí vědecky ověřených tipů.",
            },
            {
              icon: "🚀",
              title: "ON Club / VIP přechod",
              desc: "Jakmile tě to chytne, můžeš přejít do ON Clubu nebo osobního koučinku.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-start bg-[#1b0d3d] p-6 rounded-2xl shadow-lg hover:shadow-[#9b5cff]/40 transition-all"
            >
              <div className="text-4xl mr-4">{item.icon}</div>
              <div>
                <h3 className="text-xl font-semibold text-[#2ECC71] mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-300">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Formulář */}
      <section id="formular" className="py-20 bg-[#08011a] border-t border-gray-700">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-8 text-[#9b5cff]">
            Vyplň své údaje
          </h2>
          <p className="text-center text-gray-400 mb-10">
            Stačí pár minut a tvůj osobní plán bude připraven.
          </p>
          <PricingForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-sm border-t border-[#2ECC71]/20">
        © {new Date().getFullYear()} Body & Mind ON — Zapni své tělo i mysl.
      </footer>
    </div>
  );
}
