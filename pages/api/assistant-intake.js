export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const data = req.body;

    console.log("📩 Přijatá data:", data);

    // Tady můžeš volat tvého AI asistenta, nebo logiku Supabase / e-mailu
    // ...

    // Úspěšná odpověď:
    return res.status(200).json({ success: true, message: "Formulář přijat" });
  } catch (error) {
    console.error("❌ Chyba serveru:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
}
