// /lib/supabaseServer.js
import { createClient } from '@supabase/supabase-js';

// Fallbacky pro tvoje existující názvy ve Vercelu
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('Chybí SUPABASE_URL env variable');
}
if (!SUPABASE_SERVICE_ROLE) {
  throw new Error('Chybí SUPABASE_SERVICE_ROLE env variable');
}

export const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
