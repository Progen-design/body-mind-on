import { useState } from "react";
import { motion } from "framer-motion";
import { FaMars, FaVenus, FaDumbbell, FaAppleAlt, FaBrain } from "react-icons/fa";

export default function StartProgram() {
  const [gender, setGender] = useState(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#080014] via-[#15002c] to-[#080014] text-white flex flex-col items-center px-4 py-20">
      {/* Nadpis */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16 max-w-4xl"
      >
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-[#A020F0] to-[#2ECC71] bg-clip-text text-transparent">
          START Program – Začni zdarma
        </h1>
        <p className="text-gray-300 text-lg leading-relaxed">
          Vyzkoušej systém <span className="text-[#2ECC71] font-semibold">bez rizika</span> — během pár minut získáš
          osobní plán tréninku, jídelníček i regeneraci od našeho AI asistenta.
          <br />
          <span className="text-[#2ECC71] font-semibold">První týden zcela zdarma, bez závazků.</span>
        </p>
      </motion.div>

      {/* 3 BENEFITY */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="grid md:grid-cols-3 gap-8 w-full max-w-5xl mb-20"
      >
        {[
          { icon: <FaDumbbell />, title: "Tréninkový plán", desc: "AI ti sestaví cvičení přesně na míru." },
          { icon: <FaAppleAlt />, title: "Jídelníček", desc: "Z českých surovin s makry a doporučeními." },
          { icon: <FaBrain />, title: "AI koučink", desc: "Získáš rady pro regeneraci, spánek i mindset." },
        ].map((b, i) => (
          <div
            key={i}
            className="bg-gradient-to-br from-[#100025] to-[#0a0015] rounded-2xl border border-[#A020F0]/20 shadow-xl p-8 text-center hover:scale-[1.03] transition-all"
          >
            <div className="text-4xl mb-3 text-[#2ECC71]">{b.icon}</div>
            <h3 className="text-xl font-semibold mb-2 text-white">{b.title}</h3>
            <p className="text-gray-400 text-sm">{b.desc}</p>
          </div>
        ))}
      </motion.div>

      {/* FORM KARTA */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="w-full max-w-4xl bg-gradient-to-br from-[#110022] to-[#0a0015] p-10 rounded-3xl shadow-2xl border border-[#A020F0]/20"
      >
        <h2 className="text-3xl font-semibold text-center mb-10 bg-gradient-to-r from-[#A020F0] to-[#2ECC71] bg-clip-text text-transparent">
          📝 Aktivuj svůj plán zdarma
        </h2>

        <form className="grid md:grid-cols-2 gap-6 text-gray-300">
          <Input label="Jméno a příjmení" type="text" placeholder="Jan Novák" />
          <Input label="E-mail" type="email" placeholder="jan@bodymindon.cz" />
          <Input label="Věk (roky)" type="number" placeholder="32" />
          <Input label="Výška (cm)" type="number" placeholder="180" />
          <Input label="Váha (kg)" type="number" placeholder="80" />

          {/* POHLAVÍ */}
          <div className="md:col-span-2 text-center">
            <label className="block mb-3 text-sm text-gray-400">Pohlaví</label>
            <div className="flex justify-center gap-8">
              <button
                type="button"
                onClick={() => setGender("male")}
                className={`flex flex-col items-center p-4 rounded-2xl border transition-all ${
                  gender === "male"
                    ? "border-[#2ECC71] bg-[#2ECC71]/20 scale-105 shadow-lg"
                    : "border-[#A020F0]/20 hover:border-[#2ECC71]/40 hover:bg-[#2ECC71]/10"
                }`}
              >
                <FaMars size={28} className="mb-1" />
                <span>Muž</span>
              </button>
              <button
                type="button"
                onClick={() => setGender("female")}
                className={`flex flex-col items-center p-4 rounded-2xl border transition-all ${
                  gender === "female"
                    ? "border-[#2ECC71] bg-[#2ECC71]/20 scale-105 shadow-lg"
                    : "border-[#A020F0]/20 hover:border-[#2ECC71]/40 hover:bg-[#2ECC71]/10"
                }`}
              >
                <FaVenus size={28} className="mb-1" />
                <span>Žena</span>
              </button>
            </div>
          </div>

          <Select label="Aktivita" options={["Nízká", "Střední", "Vysoká"]} />
          <Select label="Typ práce" options={["Kancelář / IT", "Manuální", "Smíšená"]} />
          <Select label="Cíl" options={["Redukce hmotnosti", "Udržování", "Nabírání svalů"]} />

          <div className="md:col-span-2">
            <label className="block mb-2 text-sm text-gray-400">Poznámky (volitelné)</label>
            <textarea
              className="w-full p-3 rounded-lg bg-[#1a1a1d] border border-gray-700 focus:border-[#A020F0] focus:ring-2 focus:ring-[#A020F0]/30 transition-all h-28"
              placeholder="Zdravotní omezení, preference jídel..."
            />
          </div>

          <div className="md:col-span-2 text-center mt-8">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              className="bg-gradient-to-r from-[#A020F0] to-[#2ECC71] text-white font-semibold px-14 py-4 rounded-full shadow-lg hover:opacity-90 transition"
            >
              🚀 Odeslat a získat plán
            </motion.button>
            <p className="text-gray-400 text-sm mt-3">
              Tvůj plán přijde e-mailem během 2 minut.
            </p>
          </div>
        </form>
      </motion.div>

      <style jsx global>{`
        footer {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

function Input({ label, type, placeholder }) {
  return (
    <div>
      <label className="block mb-2 text-sm text-gray-400">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full p-3 rounded-lg bg-[#0c001a] border border-gray-700 focus:border-[#2ECC71] focus:ring-2 focus:ring-[#2ECC71]/30 transition-all"
        required
      />
    </div>
  );
}

function Select({ label, options }) {
  return (
    <div>
      <label className="block mb-2 text-sm text-gray-400">{label}</label>
      <select className="w-full p-3 rounded-lg bg-[#0c001a] border border-gray-700 focus:border-[#A020F0] focus:ring-2 focus:ring-[#A020F0]/30 transition-all">
        {options.map((opt, i) => (
          <option key={i}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
