import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function StartProgram() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setDone(true);
    }, 3500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#080014] via-[#170033] to-[#060010] text-white flex flex-col items-center px-6 py-16 font-sans">
      
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
          Zapni své tělo i mysl – během pár minut získáš <span className="text-[#2ECC71] font-semibold">osobní plán tréninku</span>, 
          jídelníček i regeneraci. <br />První týden <span className="text-[#2ECC71] font-semibold">zcela zdarma</span>, bez závazků.
        </p>

        <motion.a
          href="#formular"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          className="inline-block bg-[#A020F0] text-white font-semibold px-10 py-4 rounded-full shadow-lg hover:bg-[#8b1dd1] transition-all duration-300"
        >
          🚀 Začít zdarma
        </motion.a>
        <p className="mt-4 text-sm text-gray-400">Tvůj plán bude připraven během 2 minut.</p>
      </motion.div>

      {/* BENEFITY */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="grid md:grid-cols-3 gap-8 text-center mb-20 max-w-6xl"
      >
        {[
          { icon: "💪", title: "Tréninkový plán", text: "AI trenér přizpůsobí trénink tvým cílům a možnostem." },
          { icon: "🥗", title: "Jídelníček na míru", text: "Z českých surovin, přehledně s makry a doporučeními." },
          { icon: "🧠", title: "AI doporučení", text: "Získáš tipy pro regeneraci, spánek a motivaci." },
        ].map((b, i) => (
          <motion.div
            key={i}
            whileHover={{ scale: 1.05, y: -5 }}
            className="p-8 bg-gradient-to-br from-[#130027] to-[#0a0018] rounded-3xl border border-[#2ECC71]/25 shadow-lg"
          >
            <div className="text-4xl mb-3">{b.icon}</div>
            <h3 className="text-xl font-semibold mb-2 text-[#2ECC71]">{b.title}</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{b.text}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* FORMULÁŘ */}
      <motion.div
        id="formular"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="bg-gradient-to-br from-[#0f0020]/90 to-[#180040]/90 p-10 rounded-3xl shadow-2xl max-w-4xl w-full border border-[#A020F0]/20"
      >
        <h2 className="text-3xl font-bold text-center mb-10 bg-gradient-to-r from-[#A020F0] to-[#2ECC71] bg-clip-text text-transparent">
          📝 Aktivuj svůj plán zdarma
        </h2>

        <AnimatePresence>
          {!loading && !done && (
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4 }}
              className="grid md:grid-cols-2 gap-6 text-gray-300"
            >
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

              <div className="text-center md:col-span-2 mt-8">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  className="bg-[#2ECC71] text-black font-semibold px-12 py-4 rounded-full shadow-xl hover:bg-[#27ae60] transition-all duration-300"
                >
                  Odeslat a získat plán
                </motion.button>
              </div>
            </motion.form>
          )}

          {/* LOADING */}
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center flex flex-col items-center justify-center py-20"
            >
              <motion.div
                className="w-16 h-16 border-4 border-t-[#A020F0] border-[#2ECC71] rounded-full animate-spin mb-6"
                transition={{ repeat: Infinity, duration: 1 }}
              />
              <p className="text-lg text-gray-300">AI připravuje tvůj plán...</p>
            </motion.div>
          )}

          {/* HOTOVO */}
          {done && (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-semibold mb-2 text-[#2ECC71]">Hotovo!</h3>
              <p className="text-gray-300 mb-6">
                Tvůj osobní plán byl úspěšně vygenerován a odeslán na tvůj e-mail.
              </p>
              <a
                href="/"
                className="inline-block bg-[#A020F0] text-white px-8 py-3 rounded-full font-medium hover:bg-[#8b1dd1] transition-all"
              >
                Zpět na hlavní stránku
              </a>
            </motion.div>
          )}
        </AnimatePresence>
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
        className="w-full p-3 rounded-lg bg-[#1a1a1d] border border-gray-700 focus:border-[#2ECC71] focus:ring-2 focus:ring-[#2ECC71]/30 transition-all"
        required
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
