// /pages/api/recipe.js – vygeneruje recept pro jídlo (když v plánu chybí)
import { openai } from '../../lib/openai';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }

  const dish = (req.query.dish || '').trim();
  if (!dish || dish.length > 200) {
    return res.status(400).json({ error: 'Zadej název jídla (parametr dish)' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Služba receptů není nakonfigurována' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `Jsi kuchařský asistent. Odpovídej pouze v češtině. Pro zadané jídlo vrať stručný recept v tomto HTML formátu (nic jiného):
<p><b>Suroviny:</b> odrážkový seznam surovin s přibližným množstvím (např. 2 ks, 100 g).</p>
<p><b>Postup:</b> krátké číslované kroky (3–6 kroků), jak jídlo připravit.</p>
Nepoužívej markdown, pouze <p>, <b>, <ul>, <li>. Žádný úvod ani závěr.`,
        },
        {
          role: 'user',
          content: `Napiš stručný recept pro toto jídlo: ${dish}`,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || '';
    const html = raw
      .replace(/^```\s*html?\s*\n?/i, '')
      .replace(/\n?```\s*$/g, '')
      .trim();

    return res.status(200).json({ ok: true, html: html || raw });
  } catch (err) {
    console.error('[api/recipe]', err.message || err);
    return res.status(500).json({ error: 'Nepodařilo se vygenerovat recept' });
  }
}
