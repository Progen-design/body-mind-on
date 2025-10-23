// ✅ Umožní Next.js správně parsovat JSON tělo
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Pouze metoda POST je povolena" });
  }

  try {
    const data = req.body;

    // ✅ Ověření, že data existují
    if (!data || Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Formulář neobsahuje žádná data" });
    }

    console.log("✅ Přijatá data z formuláře:", data);

    // 🔹 Zde můžeš volat svého AI asistenta nebo uložit data do Supabase / odeslat e-mail
    // await fetch("https://tvuj-ai-agent.cz/api", { method: "POST", body: JSON.stringify(data) });

    // ✅ Úspěšná odpověď
    return res
      .status(200)
      .json({ success: true, message: "Formulář úspěšně přijat", data });
  } catch (error) {
    console.error("❌ Chyba serveru:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
}
