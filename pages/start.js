import { motion } from "framer-motion";

export default function StartProgram() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0015] via-[#150030] to-[#0b001b] text-white flex flex-col items-center px-6 py-16 font-sans">
      
      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-5xl text-center mb-16"
      >
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-[#A020F0] to-[#2ECC71] bg-clip-text text-transparent drop-shadow-xl">
          START Program – Začni zdarma
        </h1>
        <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-8">
          Vyzkoušej systém <span className="text-[#2ECC71] font-semibold">bez rizika</span> – 
          během pár minut získáš osobní plán tréninku, jídelníček i regeneraci od AI asistenta.
          <br />První týden <span className="text-[#2ECC71] font-semibold">zcela zdarma</span>.
        </p>
        <motion.a
          href="#formular"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          className="inline-block bg-[#A020F0] text-white font-semibold px-10 py-4 rounded-full shadow-lg hover:bg-[#8b1dd1] transition-all duration-300"
        >
          🚀 Začít zdarma
        </motion.a>
        <p className="mt-4 text-sm text-gray-400">Tvůj osobní plán bude připraven během 2 minut.</p>
      </motion.div>

      {/* 3 BENEFITY */}
      <div className="grid md:grid-cols-3 gap-8 text-center mb-20 max-w-6xl">
        {[
          { icon: "💪", title: "Tréninkový plán", text: "AI trenér sestaví plán podle tvých cílů, kondice a času." },
          { icon: "🍽️", title: "Jídelníček na míru", text: "Recepty z českých surovin, výpočet kalorií a maker." },
          { icon: "🧠", title: "AI asistence", text: "Získáš doporučení na regeneraci, spánek a lepší návyky." },
        ].map((b, i) => (
          <motion.div
            key={i}
            whileHover={{ scale: 1.05 }}
            className="p-8 bg-gradient-to-br from-[#16002b] to-[#0b0015] rounded-3xl border border-[#2ECC71]/20 shadow-lg"
          >
            <div className="text-4xl mb-4">{b.icon}</div>
            <h3 className="text-xl font-semibold mb-2 text-[#2ECC71]">{b.title}</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{b.text}</p>
          </motion.div>
        ))}
      </div>

      {/* FORMULÁŘ */}
      <motion.div
        id="formular"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="bg-gradient-to-br from-[#110020]/90 to-[#190037]/90 p-10 rounded-3xl shadow-2xl max-w-4xl w-full border border-[#2ECC71]/15"
      >
        <h2 className="text-3xl font-bold text-center mb-10 bg-gradient-to-r from-[#A020F0] to-[#2ECC71] bg-clip-text text-transparent">
          📝 Aktivuj svůj plán zdarma
        </h2>
        <p className="text-center text-gray-400 mb-10">
          Vyplň pár údajů – AI ti během 2 minut připraví osobní plán.  
          Po odeslání ti přijde e-mailem i do tvého profilu.
        </p>

        <form className="grid md:grid-cols-2 gap-6 text-gray-300">
          <Input label="Jméno a příjmení" type="text" />
          <Input label="E-mail" type="email" />
          <Input label="Věk (roky)" type="number" />
          <Input label="Váha (kg)" type="number" />
          <Input label="Výška (cm)" type="number" />
          <Select label="Aktivita" options={["Nízká", "Střední", "Vysoká"]} />
          <Select label="Typ práce" options={["Kancelář / IT", "Fyzická", "Smíšená"]} />
          <Select label="Cíl" options={["Redukce hmotnosti", "Udržování", "Nabírání svalů"]} />

          <div className="md:col-span-2">
            <label className="block mb-2 text-sm text-gray-400">Poznámky (volitelné)</label>
            <textarea
              className="w-full p-3 rounded-lg bg-[#1a1a1d] border border-gray-700 focus:border-[#A020F0] focus:ring-2 focus:ring-[#A020F0]/30 transition-all h-28"
              placeholder="Zdravotní omezení, preference jídel..."
            />
          </div>
        </form>

        <div className="text-center mt-10">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="bg-[#2ECC71] text-black font-semibold px-12 py-4 rounded-full shadow-xl hover:bg-[#27ae60] transition-all duration-300"
          >
            Odeslat a získat plán
          </motion.button>
        </div>
      </motion.div>

      {/* SCHOVÁNÍ FOOTERU */}
      <style jsx global>{`
        footer {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

/* Pomocné komponenty */
function Input({ label, type }) {
  return (
    <div>
      <label className="block mb-2 text-sm text-gray-400">{label}</label>
      <input
        type={type}
        className="w-full p-3 rounded-lg bg-[#1a1a1d] border border-gray-700 focus:border-[#2ECC71] focus:ring-2 focus:ring-[#2ECC71]/30 transition-all"
      />
    </div>
  );
}

function Select({ label, options }) {
  return (
    <div>
      <label className="block mb-2 text-sm text-gray-400">{label}</label>
      <select className="w-full p-3 rounded-lg bg-[#1a1a1d] border border-gray-700 focus:border-[#A020F0] focus:ring-2 focus:ring-[#A020F0]/30 transition-all">
        {options.map((opt, i) => (
          <option key={i}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
