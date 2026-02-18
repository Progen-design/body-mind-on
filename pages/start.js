import React from "react";
import BodyMetricsForm from "../components/BodyMetricsForm";

export default function StartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0121] via-[#1b0640] to-[#2a0a6e] text-white">
      {/* Hero Section */}
      <section className="flex flex-col md:flex-row items-center justify-center text-center md:text-left px-6 md:px-16 py-20 max-w-7xl mx-auto gap-10">
        {/* Text */}
        <div className="flex-1 start-animate">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-[#9b5cff] to-[#2ECC71] text-transparent bg-clip-text">
              Body & Mind ON
            </span>{" "}
            – Start program
          </h1>
          <p className="text-lg text-gray-300 mb-8 leading-relaxed max-w-lg">
            Získej svůj osobní <span className="text-[#2ECC71] font-semibold">AI plán</span> tréninku, jídelníčku a regenerace během pár minut.  
            Vše přizpůsobené tvým cílům – a první týden <span className="text-[#9b5cff] font-semibold">zcela zdarma.</span>
          </p>

          <a
            href="#formular"
            className="inline-block bg-[#2ECC71] text-black font-semibold text-lg px-10 py-4 rounded-full hover:bg-[#27AE60] transition-all transform hover:scale-105 shadow-lg"
          >
            💪 Začít zdarma
          </a>

          <p className="text-sm text-gray-400 mt-3">
            Bez závazků – první plán získáš okamžitě po vyplnění.
          </p>
        </div>

        {/* Ilustrace / AI vizual */}
        <div className="flex-1 flex justify-center start-animate-delay">
          <img
            src="https://cdn.jsdelivr.net/gh/janprikopa/assets/ai-fitness-dashboard.png"
            alt="AI dashboard illustration"
            className="w-[90%] md:w-[80%] drop-shadow-[0_0_30px_rgba(155,92,255,0.4)] rounded-3xl"
          />
        </div>
      </section>

      {/* Form Card */}
      <section
        id="formular"
        className="max-w-5xl mx-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-10 md:p-16 my-10 start-animate-up"
      >
        <h2 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-[#9b5cff] to-[#2ECC71] text-transparent bg-clip-text">
          Aktivuj svůj plán zdarma
        </h2>
        <p className="text-center text-gray-300 mb-10 max-w-2xl mx-auto">
          Vyplň jen pár údajů a naše AI ti během <span className="text-[#2ECC71]">2 minut</span> vytvoří osobní plán.  
          Plán ti přijde e-mailem a uloží se do tvého profilu.
        </p>
        <BodyMetricsForm submitLabel="Dokončit registraci" />
      </section>

      {/* CTA + Footer */}
      <div className="text-center mt-12 mb-10 start-animate-delay">
        <a
          href="#formular"
          className="bg-[#9b5cff] hover:bg-[#8a49e0] text-white font-semibold px-10 py-4 rounded-full transition-all transform hover:scale-105"
        >
          🚀 Spustit zdarma teď
        </a>
        <p className="text-gray-400 text-sm mt-4">
          Tvůj plán je připraven do 2 minut. Bez registrace, bez stresu.
        </p>
      </div>

      <style jsx global>{`
        @keyframes startFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .start-animate { animation: startFadeIn 0.8s ease-out forwards; }
        .start-animate-delay { animation: startFadeIn 0.8s ease-out 0.2s forwards; opacity: 0; }
        .start-animate-up { animation: startFadeIn 0.8s ease-out 0.4s forwards; opacity: 0; }
      `}</style>

      <footer className="text-center py-6 text-gray-500 text-sm border-t border-white/10">
        © {new Date().getFullYear()} Body & Mind ON — Zapni své tělo i mysl.
      </footer>
    </div>
  );
}
