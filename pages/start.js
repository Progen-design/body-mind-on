import { motion } from "framer-motion";

export default function StartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0015] via-[#1c0040] to-[#090016] text-white flex flex-col items-center px-4 py-16">
      
      {/* HERO SEKCE */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-5xl text-center mb-16"
      >
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-[#2ECC71] to-[#00BFFF] bg-clip-text text-transparent drop-shadow-lg">
          Body & Mind ON – Start program
        </h1>
        <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-8">
          Získej svůj osobní AI plán tréninku, jídelníčku a regenerace během pár minut.  
          Vše přizpůsobené tvým cílům – první týden zcela zdarma, bez závazků.
        </p>

        <motion.a
          href="#formular"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          className="inline-block bg-[#2ECC71] text-black font-semibold px-10 py-4 rounded-full shadow-xl hover:bg-[#27ae60] transition-all duration-300"
        >
          🚀 Začít zdarma
        </motion.a>
        <p className="mt-4 text-sm text-gray-400">
          Tvůj osobní plán bude připraven během 2 minut.
        </p>
      </motion.div>

      {/* BENEFITY */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="grid md:grid-cols-3 gap-8 text-center mb-24 max-w-6xl"
      >
        {[
          { icon: "🧠", title: "AI plánování", text: "Každý plán sestavuje AI trenér na základě tvých údajů." },
          { icon: "💪", title: "Komplexní přístup", text: "Trénink, jídelníček, regenerace i mindset v jednom systému." },
          { icon: "⚡", title: "Okamžitý výsledek", text: "Plán ti dorazí během několika minut na e-mail." },
        ].map((b, i) => (
          <motion.div
            key={i}
            whileHover={{ scale: 1.05, y: -5 }}
            className="p-6 bg-[#110020]/60 backdrop-blur-md rounded-2xl border border-[#2ECC71]/20 shadow-lg"
          >
            <div className="text-4xl mb-4">{b.icon}</div>
            <h3 className="text-xl font-semibold mb-2 text-[#2ECC71]">{b.title}</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{b.text}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* FORMULÁŘ */}
      <motion.div
        id="formular"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="bg-[#0f0f12]/90 p-10 rounded-3xl shadow-2xl max-w-5xl w-full border border-[#2ECC71]/10"
      >
        <h2 className="text-3xl font-bold text-center mb-10 bg-gradient-to-r from-[#00BFFF] to-[#2ECC71] bg-clip-text text-transparent">
          📝 Aktivuj svůj plán zdarma
        </h2>
        <p className="text-center text-gray-400 mb-10">
          Vyplň pár údajů a naše AI ti během 2 minut připraví osobní plán.  
          Po dokončení ti přijde e-mailem i do tvého profilu.
        </p>

        <form className="grid md:grid-cols-2 gap-6 text-gray-300">
          <Input label="Jméno a příjmení" type="text" />
          <Input label="E-mail" type="email" />
          <Input label="Věk (roky)" type="number" />
          <Input label="Váha (kg)" type="number" />
          <Input label="Výška (cm)" type="number" />
          
          <Select label="Aktivita" options={["Lehká", "Střední", "Vysoká"]} />
          <Select label="Typ práce" options={["Kancelář / IT", "Fyzická", "Smíšená"]} />
          <Select label="Cíl" options={["Redukce hmotnosti", "Udržování", "Nabírání svalů"]} />

          <div className="md:col-span-2">
            <label className="block mb-2 text-sm text-gray-400">Poznámky (volitelné)</label>
            <textarea
              className="w-full p-3 rounded-lg bg-[#1a1a1d] border border-gray-700 focus:border-[#2ECC71] focus:ring-2 focus:ring-[#2ECC71]/30 transition-all h-28"
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

function Input({ label, type }) {
  return (
    <div>
      <label className="block mb-2 text-sm text-gray-400">{label}</label>
      <input
        type={type}
        className="w-full p-3 rounded-lg bg-[#1a1a1d] border border-gray-700 focus:border-[#00BFFF] focus:ring-2 focus:ring-[#00BFFF]/30 transition-all"
      />
    </div>
  );
}

function Select({ label, options }) {
  return (
    <div>
      <label className="block mb-2 text-sm text-gray-400">{label}</label>
      <select className="w-full p-3 rounded-lg bg-[#1a1a1d] border border-gray-700 focus:border-[#2ECC71] focus:ring-2 focus:ring-[#2ECC71]/30 transition-all">
        {options.map((opt, i) => (
          <option key={i}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
