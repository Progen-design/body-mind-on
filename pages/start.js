import React from "react";
import PricingForm from "./pricing";

export default function StartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0121] via-[#1b0640] to-[#2a0a6e] text-white flex flex-col items-center justify-center px-6 py-16">
      {/* HERO sekce */}
      <div className="text-center max-w-3xl mb-12">
        <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-[#9b5cff] to-[#2ECC71] text-transparent bg-clip-text">
          Začni zdarma s Body & Mind ON
        </h1>
        <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
          Aktivuj svůj osobní AI plán tréninku, jídelníčku a regenerace během
          <span className="text-[#2ECC71] font-semibold"> 2 minut</span>.  
          První týden je zcela <span className="text-[#9b5cff] font-semibold">zdarma</span> — bez závazků.
        </p>
      </div>

      {/* Karta s formulářem */}
      <div className="bg-[#100627]/70 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-4xl p-8 md:p-12 border border-[#2ECC71]/20">
        <h2 className="text-3xl font-bold text-center mb-8 text-[#9b5cff]">
          Vyplň své údaje
        </h2>
        <PricingForm />
      </div>

      {/* CTA pod formulářem */}
      <div className="text-center mt-12">
        <p className="text-gray-400 text-sm">
          Tvůj plán bude připraven a doručen e-mailem během pár minut.  
        </p>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="mt-4 bg-[#2ECC71] hover:bg-[#27AE60] text-black font-semibold px-10 py-4 rounded-full text-lg transition-transform hover:scale-105"
        >
          🔥 Aktivovat zdarma
        </button>
      </div>

      {/* Footer */}
      <footer className="text-center mt-20 text-gray-500 text-sm">
        © {new Date().getFullYear()} Body & Mind ON — Zapni své tělo i mysl.
      </footer>
    </div>
  );
}
