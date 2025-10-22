export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    // ✅ 1. Načti JSON z těla požadavku
    const data = req.body;

    // ✅ 2. Ověř, že všechna data existují
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: "Empty request body" });
    }

    console.log("✅ Přijatá data z formuláře:", data);

    // ✅ 3. Tady můžeš připojit AI asistenta / Supabase / email logiku
    // Například: uložit data do Supabase, nebo poslat e-mailem
    // await supabase.from("form_submissions").insert([{ ...data }]);

    // ✅ 4. Vrátit odpověď zpět klientovi
    return res.status(200).json({ success: true, message: "Formulář úspěšně přijat", received: data });
  } catch (error) {
    console.error("❌ Chyba serveru:", error);
    return res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
}
