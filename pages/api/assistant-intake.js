// ✅ Aktivace JSON parseru pro Vercel
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Pouze metoda POST je povolena",
    });
  }

  try {
    // ✅ Získání dat z formuláře
    const data = req.body;

    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Formulář neobsahuje žádná data",
      });
    }

    console.log("✅ Přijatá data z formuláře:", data);

    // ✅ Zde můžeš připojit logiku (odeslání e-mailu / uložení do Supabase / napojení na asistenta)
    // Například:
    // await fetch("https://api.openai.com/v1/assistants", { method: "POST", body: JSON.stringify(data) });

    // ✅ Odpověď klientovi
    return res.status(200).json({
      success: true,
      message: "Formulář úspěšně přijat",
      data,
    });
  } catch (error) {
    console.error("❌ Chyba serveru:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
}
