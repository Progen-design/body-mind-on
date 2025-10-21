import { motion } from "framer-motion";

export default function StartProgram() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#090014] via-[#15002c] to-[#090014] text-white flex flex-col items-center px-4 py-20">
      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16 max-w-3xl"
      >
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-[#A020F0] to-[#2ECC71] bg-clip-text text-transparent">
          START Program – Začni zdarma
        </h1>
        <p className="text-gray-300 text-lg leading-relaxed">
          Vyzkoušej systém <span className="text-[#2ECC71] font-semibold">bez rizika</span> –
          během pár minut získáš osobní plán tréninku, jídelníček i regeneraci od AI asistenta.
          <br />První týden zcela zdarma, bez závazků.
        </p>
      </motion.div>

      {/* KARTA */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="w-full max-w-4xl bg-gradient-to-br from-[#13002b] to-[#0a0015] p-10 rounded-3xl shadow-2xl border border-[#A020F0]/20"
      >
        {/* Sekce – přehled benefitů */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {[
            { icon: "💪", title: "Tréninkový plán", desc: "AI trenér ti sestaví cvičení na míru." },
            { icon: "🥗", title: "Jídelníček", desc: "Z českých surovin, přehledně s makry a tipy." },
            { icon: "🧠", title: "AI koučink", desc: "Získáš rady pro regeneraci, spánek i mindset." },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-[#0e001f] rounded-2xl p-6 border border-[#2ECC71]/20 shadow-md hover:border-[#2ECC71]/40 transition"
            >
              <div className="text-4xl mb-3">{item.icon}</div>
              <h3 className="text-lg font-semibold text-[#2ECC71]">{item.title}</h3>
              <p className="text-sm text-gray-400 mt-2">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* FORMULÁŘ */}
        <h2 className="text-3xl font-semibold text-center mb-8 bg-gradient-to-r from-[#A020F0] to-[#2ECC71] bg-clip-text text-transparent">
          📝 Aktivuj svůj plán zdarma
        </h2>

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

          <div className="md:col-span-2 text-center mt-8">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              className="bg-gradient-to-r from-[#A020F0] to-[#2ECC71] text-white font-semibold px-14 py-4 rounded-full shadow-lg hover:opacity-90 transition"
            >
              Odeslat a získat plán
            </motion.button>
            <p className="text-gray-400 text-sm mt-3">
              Tvůj plán přijde e-mailem během 2 minut.
            </p>
          </div>
        </form>
      </motion.div>

      {/* SKRYTÍ FOOTERU */}
      <style jsx global>{`
        footer {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

/* 🔹 Pomocné komponenty */
function Input({ label, type }) {
  return (
    <div>
      <label className="block mb-2 text-sm text-gray-400">{label}</label>
      <input
        type={type}
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
