import { supabaseServer } from '../supabaseServer';

export async function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Nejste přihlášen', status: 401 };

  const {
    data: { user },
    error: userErr,
  } = await supabaseServer.auth.getUser(token);

  if (userErr || !user) return { error: 'Neplatná session', status: 401 };
  return { user };
}
