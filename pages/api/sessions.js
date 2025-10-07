import supabase from "@/lib/supabaseClient";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).send("Nejste přihlášen");

    const { duration } = req.body;
    const PRICE = { 30: 790, 60: 1190, 90: 1690 };
    const price_czk = PRICE[duration] || 1190;

    const { error } = await supabase.from("sessions").insert({
      user_id: user.id,
      duration_min: duration,
      price_czk,
      status: "new",
    });

    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Chyba serveru");
  }
}
