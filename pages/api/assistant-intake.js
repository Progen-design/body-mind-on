import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const config = {
  api: { bodyParser: true },
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Pouze POST je povolen" });
  }

  try {
    const data = req.body;
    if (!data.email) throw new Error("Chybí e-mail");

    // ✅ Uložení do Supabase
    const { error } = await supabase.from("registrations").insert([data]);
    if (error) throw error;

    // ✅ Odeslání potvrzovacího e-mailu
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Body & Mind ON" <${process.env.SMTP_USER}>`,
      to: data.email,
      subject: `Tvůj AI plán – ${data.program}`,
      html: `
        <h2>Ahoj ${data.name || "člene"},</h2>
        <p>Díky za vyplnění formuláře pro program <b>${data.program}</b>.</p>
        <p>Tvůj osobní AI asistent nyní připravuje plán – brzy ti ho zašleme na tento e-mail.</p>
        <hr/>
        <small>Body & Mind ON © 2025</small>
      `,
    });

    console.log("✅ Záznam uložen a e-mail odeslán:", data.email);

    return res.status(200).json({ success: true, message: "E-mail odeslán" });
  } catch (error) {
    console.error("❌ Chyba:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
