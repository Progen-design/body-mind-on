export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const data = req.body;

    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: "Empty request body" });
    }

    console.log("✅ Přijatá data z formuláře:", data);

    // Sem můžeš připojit logiku: odeslat do AI asistenta / Supabase / e-mail
    // Např. await fetch("https://api.openai.com/v1/...")

    return res.status(200).json({
      success: true,
      message: "Formulář úspěšně přijat",
      received: data,
    });
  } catch (error) {
    console.error("❌ Chyba serveru:", error);
    return res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
}
