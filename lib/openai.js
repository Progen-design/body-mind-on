// /lib/openai.js
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Chybí OPENAI_API_KEY');
}

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
